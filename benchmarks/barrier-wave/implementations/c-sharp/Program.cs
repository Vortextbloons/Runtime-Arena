using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Collections.Generic;

const long INITIAL_DIGEST = unchecked((long)0x6a09e667f3bcc909);

static int Mix32(int x)
{
    x ^= x >>> 16;
    x = unchecked((int)((uint)x * 0x21f0aaad));
    x ^= x >>> 15;
    x = unchecked((int)((uint)x * 0x735a2d97));
    x ^= x >>> 15;
    return x;
}

static long RotateLeft64(long value) => unchecked((value << 7) | (value >>> 57));

static string Hex(long value, int digits)
{
    const string HEX_CHARS = "0123456789abcdef";
    var result = new char[digits];
    for (int i = digits - 1; i >= 0; i--)
    {
        result[i] = HEX_CHARS[(int)(value & 0xfL)];
        value >>>= 4;
    }
    return new string(result);
}

static double CiWidth(long[] samples, int count)
{
    double[] tCritical = { 0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045 };
    int n = count;
    if (n < 2) return double.PositiveInfinity;
    double mean = 0;
    for (int i = 0; i < n; i++) mean += samples[i];
    mean /= n;
    if (mean <= 0) return double.PositiveInfinity;
    double variance = 0;
    for (int i = 0; i < n; i++)
    {
        double delta = samples[i] - mean;
        variance += delta * delta;
    }
    variance /= (n - 1);
    double t = n < tCritical.Length ? tCritical[n] : 2.0;
    return (2 * t * Math.Sqrt(variance / n)) / mean;
}

static string[] Kernel(WorkerPool pool, int workerCount, int phaseCount, long initialSeed)
{
    int phaseSeed = (int)initialSeed;
    long digest = INITIAL_DIGEST;

    for (int phase = 0; phase < phaseCount; phase++)
    {
        for (int w = 0; w < workerCount; w++)
            pool.Seeds[w] = phaseSeed;

        pool.SignalAndWaitDispatch();
        pool.SignalAndWaitComplete();

        int nextSeed = phaseSeed ^ phase;
        long phaseSum = 0;
        for (int w = 0; w < workerCount; w++)
        {
            long localSum = pool.Sums[w];
            nextSeed = Mix32(nextSeed ^ pool.Xors[w] ^ (int)localSum ^ (int)(localSum >>> 32) ^ w);
            phaseSum += localSum;
        }
        phaseSeed = nextSeed;
        digest = RotateLeft64(digest) ^ (phaseSeed & 0xffffffffL);
        digest += phaseSum;
    }
    return new[] { Hex(phaseSeed & 0xffffffffL, 8), Hex(digest, 16) };
}

static (int workerCount, int phaseCount, int itemsPerWorker, int roundsPerItem, long initialSeed) ReadInput(string path)
{
    string raw = File.ReadAllText(path);
    var numRegex = new Regex("\"([A-Za-z0-9]+)\"\\s*:\\s*(?:\"([0-9a-fA-F]+)\"|([0-9]+))");
    var matches = numRegex.Matches(raw);
    int workerCount = 0, phaseCount = 0, itemsPerWorker = 0, roundsPerItem = 0;
    long initialSeed = 0;
    foreach (Match m in matches)
    {
        string key = m.Groups[1].Value;
        string val = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value;
        switch (key)
        {
            case "workerCount": workerCount = int.Parse(val); break;
            case "phaseCount": phaseCount = int.Parse(val); break;
            case "itemsPerWorker": itemsPerWorker = int.Parse(val); break;
            case "roundsPerItem": roundsPerItem = int.Parse(val); break;
            case "initialSeed": initialSeed = Convert.ToInt64(val, 16); break;
        }
    }
    return (workerCount, phaseCount, itemsPerWorker, roundsPerItem, initialSeed);
}

static string GetArg(string[] args, string name, string fallback)
{
    for (int i = 0; i + 1 < args.Length; i++)
        if (args[i] == name) return args[i + 1];
    return fallback;
}

// --- Main ---
string inputPath = GetArg(args, "--input", "");
string outputPath = GetArg(args, "--output", "");
string timingPath = GetArg(args, "--timing-output", "");
int warmup = int.Parse(GetArg(args, "--warmup", "0"));
int minIterations = int.Parse(GetArg(args, "--min-iterations", "1"));
int maxIterations = int.Parse(GetArg(args, "--max-iterations", "1"));
double targetCi = double.Parse(GetArg(args, "--target-relative-ci", "0.05"));

var (workerCount, phaseCount, itemsPerWorker, roundsPerItem, initialSeed) = ReadInput(inputPath);

var pool = new WorkerPool(workerCount, itemsPerWorker, roundsPerItem);
string[] result = null;
var samplesList = new List<(int iter, long nanos)>();

try
{
    var kernelTimes = new long[maxIterations];
    int kernelCount = 0;
    int measured = 0;

    for (int run = -warmup; ; run++)
    {
        long start = Stopwatch.GetTimestamp();
        result = Kernel(pool, workerCount, phaseCount, initialSeed);
        long elapsedNs = Math.Max(1L, (long)((Stopwatch.GetTimestamp() - start) * 1_000_000_000.0 / Stopwatch.Frequency));
        if (run >= 0)
        {
            kernelTimes[kernelCount++] = elapsedNs;
            measured++;
            samplesList.Add((measured, elapsedNs));
            if (kernelCount >= maxIterations || (kernelCount >= minIterations && CiWidth(kernelTimes, kernelCount) <= targetCi))
                break;
        }
    }
}
finally
{
    pool.Close();
}

var outputJson = $"{{\"schemaVersion\":\"1.0.0\",\"benchmark\":\"barrier-wave\",\"workerCount\":{workerCount},\"phaseCount\":{phaseCount},\"itemsProcessed\":{(long)workerCount * phaseCount * itemsPerWorker},\"finalSeed\":\"{result![0]}\",\"digest\":\"{result[1]}\"}}";
File.WriteAllText(outputPath, outputJson);

var sb = new StringBuilder("{\"samples\":[");
for (int i = 0; i < samplesList.Count; i++)
{
    if (i > 0) sb.Append(',');
    sb.Append($"{{\"iteration\":{samplesList[i].iter},\"kernelTimeNanoseconds\":{samplesList[i].nanos}}}");
}
sb.Append("]}");
File.WriteAllText(timingPath, sb.ToString());

// --- WorkerPool ---
class WorkerPool
{
    const int WORKER_MUL = unchecked((int)0x9e3779b9);
    const int ROUND_MUL = unchecked((int)0x9e3779b1);
    const int ROUND_ADD = unchecked((int)0x85ebca77);

    readonly int _workerCount, _items, _rounds;
    readonly int[] _workerBases, _workerMixes;
    readonly Thread[] _threads;
    readonly Barrier _dispatch, _complete;
    public volatile bool ShouldStop;
    public int[] Seeds;
    public int[] Xors;
    public long[] Sums;

    public WorkerPool(int workerCount, int items, int rounds)
    {
        _workerCount = workerCount;
        _items = items;
        _rounds = rounds;
        Seeds = new int[workerCount];
        Xors = new int[workerCount];
        Sums = new long[workerCount];
        _workerBases = new int[workerCount];
        _workerMixes = new int[workerCount];
        _dispatch = new Barrier(workerCount + 1);
        _complete = new Barrier(workerCount + 1);
        _threads = new Thread[workerCount];
        for (int id = 0; id < workerCount; id++)
        {
            _workerBases[id] = id * items;
            _workerMixes[id] = id * WORKER_MUL;
            int workerId = id;
            _threads[id] = new Thread(() => Run(workerId)) { Name = $"barrier-wave-{workerId}" };
            _threads[id].Start();
        }
    }

    void Run(int id)
    {
        while (true)
        {
            _dispatch.SignalAndWait();
            if (ShouldStop) return;

            int seed = Seeds[id];
            int localXor = 0;
            long localSum = 0;
            int globalItemId = _workerBases[id];
            int workerMix = _workerMixes[id];

            for (int item = 0; item < _items; item++, globalItemId++)
            {
                int x = seed ^ globalItemId ^ workerMix;
                for (int round = 0; round < _rounds; round++)
                {
                    x ^= x << 13;
                    x ^= x >>> 17;
                    x ^= x << 5;
                    x = unchecked((int)((uint)x * ROUND_MUL + ROUND_ADD));
                }
                localXor ^= x;
                unchecked { localSum += (long)(uint)x; }
            }

            Xors[id] = localXor;
            Sums[id] = localSum;
            _complete.SignalAndWait();
        }
    }

    public void SignalAndWaitDispatch() => _dispatch.SignalAndWait();
    public void SignalAndWaitComplete() => _complete.SignalAndWait();

    public void Close()
    {
        ShouldStop = true;
        _dispatch.SignalAndWait();
        for (int i = 0; i < _workerCount; i++)
            _threads[i].Join();
    }
}
