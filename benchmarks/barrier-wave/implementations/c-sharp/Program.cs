using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Collections.Generic;

const string ProtocolVersion = "2.0.0";
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

static string DigestHex(byte[] bytes) =>
    Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

static void EmitLine(string json)
{
    Console.WriteLine(json);
    Console.Out.Flush();
}

static string ProtocolField(string line, string field)
{
    string key = "\"" + field + "\":";
    int start = line.IndexOf(key, StringComparison.Ordinal);
    if (start < 0) return "";
    start += key.Length;
    while (start < line.Length && line[start] == ' ') start++;
    if (line[start] == '"')
    {
        int end = line.IndexOf('"', start + 1);
        return line[(start + 1)..end];
    }
    int endIdx = start;
    while (endIdx < line.Length && ",} ".IndexOf(line[endIdx]) < 0) endIdx++;
    return line[start..endIdx];
}

static string[] Kernel(WorkerPool pool, int workerCount, int phaseCount, long initialSeed)
{
    int phaseSeed = (int)initialSeed;
    long digest = INITIAL_DIGEST;
    int[] seeds = pool.Seeds;
    int[] xors = pool.Xors;
    long[] sums = pool.Sums;

    for (int phase = 0; phase < phaseCount; phase++)
    {
        for (int w = 0; w < workerCount; w++)
            seeds[w * WorkerPool.STRIDE_I] = phaseSeed;

        pool.SignalAndWaitDispatch();
        pool.SignalAndWaitComplete();

        int nextSeed = phaseSeed ^ phase;
        long phaseSum = 0;
        for (int w = 0; w < workerCount; w++)
        {
            long localSum = sums[w * WorkerPool.STRIDE_L];
            nextSeed = Mix32(nextSeed ^ xors[w * WorkerPool.STRIDE_I] ^ (int)localSum ^ (int)(localSum >>> 32) ^ w);
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
if (GetArg(args, "--protocol-version", "") != ProtocolVersion)
    throw new ArgumentException("unsupported protocol version");

string outputPath = GetArg(args, "--output", "");
if (string.IsNullOrEmpty(outputPath))
    throw new ArgumentException("missing required arguments");

var (workerCount, phaseCount, itemsPerWorker, roundsPerItem, initialSeed) = ReadInput(GetArg(args, "--input", ""));

var pool = new WorkerPool(workerCount, itemsPerWorker, roundsPerItem);
var encoding = new UTF8Encoding(false);
byte[] lastOutput = Array.Empty<byte>();

try
{
    EmitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + ProtocolVersion + "\"}");
    string? line;
    while ((line = Console.ReadLine()) != null)
    {
        if (line.Length == 0) continue;
        string type = ProtocolField(line, "type");
        if (type == "run")
        {
            long requestId = long.Parse(ProtocolField(line, "requestId"));
            string[] result = Kernel(pool, workerCount, phaseCount, initialSeed);
            string outputJson = $"{{\"schemaVersion\":\"1.0.0\",\"benchmark\":\"barrier-wave\",\"workerCount\":{workerCount},\"phaseCount\":{phaseCount},\"itemsProcessed\":{(long)workerCount * phaseCount * itemsPerWorker},\"finalSeed\":\"{result[0]}\",\"digest\":\"{result[1]}\"}}";
            lastOutput = encoding.GetBytes(outputJson);
            EmitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
        }
        else if (type == "finish")
        {
            File.WriteAllBytes(outputPath, lastOutput);
            EmitLine("{\"type\":\"finish\",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
            break;
        }
    }
}
finally
{
    pool.Close();
}

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
    // Strided so each worker's cell lands on its own cache line.
    public const int STRIDE_I = 16; // 16 ints = 64 bytes
    public const int STRIDE_L = 8;  // 8 longs = 64 bytes
    public int[] Seeds;
    public int[] Xors;
    public long[] Sums;

    public WorkerPool(int workerCount, int items, int rounds)
    {
        _workerCount = workerCount;
        _items = items;
        _rounds = rounds;
        Seeds = new int[workerCount * STRIDE_I];
        Xors = new int[workerCount * STRIDE_I];
        Sums = new long[workerCount * STRIDE_L];
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
        int cellI = id * STRIDE_I;
        int cellL = id * STRIDE_L;
        int items = _items;
        int rounds = _rounds;
        int n4 = items & ~3;
        while (true)
        {
            _dispatch.SignalAndWait();
            if (ShouldStop) return;

            int seed = Seeds[cellI];
            int globalBase = _workerBases[id];
            int workerMix = _workerMixes[id];
            int xor0 = 0, xor1 = 0, xor2 = 0, xor3 = 0;
            long sum0 = 0, sum1 = 0, sum2 = 0, sum3 = 0;
            int item = 0;
            for (; item < n4; item += 4)
            {
                int b = globalBase + item;
                int x0 = seed ^ b ^ workerMix;
                int x1 = seed ^ (b + 1) ^ workerMix;
                int x2 = seed ^ (b + 2) ^ workerMix;
                int x3 = seed ^ (b + 3) ^ workerMix;
                for (int round = 0; round < rounds; round++)
                {
                    x0 ^= x0 << 13; x0 ^= x0 >>> 17; x0 ^= x0 << 5; x0 = unchecked((int)((uint)x0 * ROUND_MUL + ROUND_ADD));
                    x1 ^= x1 << 13; x1 ^= x1 >>> 17; x1 ^= x1 << 5; x1 = unchecked((int)((uint)x1 * ROUND_MUL + ROUND_ADD));
                    x2 ^= x2 << 13; x2 ^= x2 >>> 17; x2 ^= x2 << 5; x2 = unchecked((int)((uint)x2 * ROUND_MUL + ROUND_ADD));
                    x3 ^= x3 << 13; x3 ^= x3 >>> 17; x3 ^= x3 << 5; x3 = unchecked((int)((uint)x3 * ROUND_MUL + ROUND_ADD));
                }
                xor0 ^= x0; unchecked { sum0 += (long)(uint)x0; }
                xor1 ^= x1; unchecked { sum1 += (long)(uint)x1; }
                xor2 ^= x2; unchecked { sum2 += (long)(uint)x2; }
                xor3 ^= x3; unchecked { sum3 += (long)(uint)x3; }
            }
            int xorT = 0;
            long sumT = 0;
            for (; item < items; item++)
            {
                int x = seed ^ (globalBase + item) ^ workerMix;
                for (int round = 0; round < rounds; round++)
                {
                    x ^= x << 13;
                    x ^= x >>> 17;
                    x ^= x << 5;
                    x = unchecked((int)((uint)x * ROUND_MUL + ROUND_ADD));
                }
                xorT ^= x;
                unchecked { sumT += (long)(uint)x; }
            }

            Xors[cellI] = xor0 ^ xor1 ^ xor2 ^ xor3 ^ xorT;
            Sums[cellL] = sum0 + sum1 + sum2 + sum3 + sumT;
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
