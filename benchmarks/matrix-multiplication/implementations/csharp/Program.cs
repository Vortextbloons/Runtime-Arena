using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

var args = Environment.GetCommandLineArgs();
static string Arg(string[] a, string name)
{
    for (int i = 1; i + 1 < a.Length; i++)
        if (a[i] == name) return a[i + 1];
    throw new ArgumentException("missing argument " + name);
}

string inputPath = Arg(args, "--input");
string outputPath = Arg(args, "--output");
string timingPath = Arg(args, "--timing-output");
int warmup = int.Parse(Arg(args, "--warmup"));
int minIterations = int.Parse(Arg(args, "--min-iterations"));
int maxIterations = int.Parse(Arg(args, "--max-iterations"));
double targetCi = double.Parse(Arg(args, "--target-relative-ci"));

string jsonText = File.ReadAllText(inputPath);
using JsonDocument doc = JsonDocument.Parse(jsonText);
JsonElement root = doc.RootElement;
int n = root.GetProperty("dimension").GetInt32();
long[] left = new long[n * n];
long[] right = new long[n * n];
int idx = 0;
foreach (JsonElement v in root.GetProperty("left").EnumerateArray())
    left[idx++] = v.GetInt64();
idx = 0;
foreach (JsonElement v in root.GetProperty("right").EnumerateArray())
    right[idx++] = v.GetInt64();

int elements = n * n;
long[] product = new long[elements];
long valueSum = 0;
long diagonalSum = 0;

static void Multiply(int n, long[] left, long[] right, long[] product, out long valueSum, out long diagonalSum)
{
    valueSum = 0;
    diagonalSum = 0;
    for (int i = 0; i < n; i++)
    {
        int leftBase = i * n;
        int outputBase = i * n;
        for (int j = 0; j < n; j++)
        {
            long sum = 0;
            int rightIndex = j;
            for (int k = 0; k < n; k++, rightIndex += n)
                sum += left[leftBase + k] * right[rightIndex];
            product[outputBase + j] = sum;
            valueSum += sum;
            if (i == j) diagonalSum += sum;
        }
    }
}

static string Checksum(int n, long[] product)
{
    using var sha = SHA256.Create();
    var sb = new StringBuilder();
    sb.Append("dimension=");
    sb.Append(n);
    sb.Append('\n');
    foreach (long v in product)
    {
        sb.Append(v);
        sb.Append(',');
    }
    sb.Append('\n');
    byte[] bytes = Encoding.UTF8.GetBytes(sb.ToString());
    byte[] hash = sha.ComputeHash(bytes);
    var hex = new char[hash.Length * 2];
    const string hexChars = "0123456789abcdef";
    for (int i = 0; i < hash.Length; i++)
    {
        hex[i * 2] = hexChars[(hash[i] >> 4) & 0xF];
        hex[i * 2 + 1] = hexChars[hash[i] & 0xF];
    }
    return new string(hex);
}

static string OutputJson(int n, int elements, long valueSum, long diagonalSum, string checksum)
{
    return "{\"benchmark\":\"matrix-multiplication\",\"version\":1,\"dimension\":"
        + n + ",\"elementCount\":" + elements + ",\"valueSum\":"
        + valueSum + ",\"diagonalSum\":" + diagonalSum + ",\"checksum\":\""
        + checksum + "\"}";
}

double[] T_CRITICAL = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045];

static double CiWidth(long[] samples, int count)
{
    if (count < 2) return double.PositiveInfinity;
    double mean = 0;
    for (int i = 0; i < count; i++) mean += samples[i];
    mean /= count;
    if (mean <= 0) return double.PositiveInfinity;
    double variance = 0;
    for (int i = 0; i < count; i++)
    {
        double delta = samples[i] - mean;
        variance += delta * delta;
    }
    variance /= (count - 1);
    double t = count < T_CRITICAL.Length ? T_CRITICAL[count] : 2.0;
    return (2 * t * Math.Sqrt(variance / count)) / mean;
}

string resultJson = null;
var samplesSb = new StringBuilder("{\"samples\":[");
long[] kernelTimes = new long[maxIterations];
int kernelCount = 0;
int measured = 0;
var sw = new Stopwatch();

for (int iteration = -warmup; ; iteration++)
{
    sw.Restart();
    Multiply(n, left, right, product, out valueSum, out diagonalSum);
    string cs = Checksum(n, product);
    sw.Stop();
    long elapsed = Math.Max(1L, sw.ElapsedTicks * 1000000000L / Stopwatch.Frequency);
    resultJson = OutputJson(n, elements, valueSum, diagonalSum, cs);

    if (iteration >= 0)
    {
        kernelTimes[kernelCount++] = elapsed;
        if (measured > 0) samplesSb.Append(',');
        measured++;
        samplesSb.Append("{\"iteration\":").Append(measured)
            .Append(",\"kernelTimeNanoseconds\":").Append(elapsed).Append('}');
        if (kernelCount >= maxIterations || (kernelCount >= minIterations && CiWidth(kernelTimes, kernelCount) <= targetCi))
            break;
    }
}

samplesSb.Append("]}");

File.WriteAllText(outputPath, resultJson);
File.WriteAllText(timingPath, samplesSb.ToString());
