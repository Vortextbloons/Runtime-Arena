using System;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

static double[] GetT_CRITICAL() => new[] { 0.0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045 };
char[] HexChars = "0123456789abcdef".ToCharArray();
double[] T_CRITICAL = GetT_CRITICAL();

static int Compare(long scoreA, long timestampA, long idA, long scoreB, long timestampB, long idB)
{
    int score = scoreB.CompareTo(scoreA);
    if (score != 0) return score;
    int timestamp = timestampA.CompareTo(timestampB);
    return timestamp != 0 ? timestamp : idA.CompareTo(idB);
}

static double CiWidth(long[] samples)
{
    int n = samples.Length;
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
    double t = n < T_CRITICAL.Length ? T_CRITICAL[n] : 2.0;
    return (2 * t * Math.Sqrt(variance / n)) / mean;
}

static void BottomUpMergeSort(long[] ids, long[] scores, long[] timestamps, int count)
{
    long[] tempIds = new long[count];
    long[] tempScores = new long[count];
    long[] tempTimestamps = new long[count];

    long[] currentIds = ids;
    long[] currentScores = scores;
    long[] currentTimestamps = timestamps;
    long[] nextIds = tempIds;
    long[] nextScores = tempScores;
    long[] nextTimestamps = tempTimestamps;

    for (int width = 1; width < count; width <<= 1)
    {
        for (int left = 0; left < count; left += width << 1)
        {
            int middle = Math.Min(left + width, count);
            int right = Math.Min(left + (width << 1), count);
            int a = left;
            int b = middle;
            int destination = left;

            while (a < middle && b < right)
            {
                if (Compare(currentScores[a], currentTimestamps[a], currentIds[a],
                            currentScores[b], currentTimestamps[b], currentIds[b]) <= 0)
                {
                    nextIds[destination] = currentIds[a];
                    nextScores[destination] = currentScores[a];
                    nextTimestamps[destination] = currentTimestamps[a];
                    destination++;
                    a++;
                }
                else
                {
                    nextIds[destination] = currentIds[b];
                    nextScores[destination] = currentScores[b];
                    nextTimestamps[destination] = currentTimestamps[b];
                    destination++;
                    b++;
                }
            }
            while (a < middle)
            {
                nextIds[destination] = currentIds[a];
                nextScores[destination] = currentScores[a];
                nextTimestamps[destination] = currentTimestamps[a];
                destination++;
                a++;
            }
            while (b < right)
            {
                nextIds[destination] = currentIds[b];
                nextScores[destination] = currentScores[b];
                nextTimestamps[destination] = currentTimestamps[b];
                destination++;
                b++;
            }
        }

        (currentIds, nextIds) = (nextIds, currentIds);
        (currentScores, nextScores) = (nextScores, currentScores);
        (currentTimestamps, nextTimestamps) = (nextTimestamps, currentTimestamps);
    }

    if (currentIds != ids)
    {
        Array.Copy(currentIds, ids, count);
        Array.Copy(currentScores, scores, count);
        Array.Copy(currentTimestamps, timestamps, count);
    }
}

static string Kernel(long[] ids, long[] scores, long[] timestamps, int count)
{
    long[] sortedIds = (long[])ids.Clone();
    long[] sortedScores = (long[])scores.Clone();
    long[] sortedTimestamps = (long[])timestamps.Clone();

    BottomUpMergeSort(sortedIds, sortedScores, sortedTimestamps, count);

    using var sha256 = SHA256.Create();
    var buffer = new byte[8192];
    int bufferPos = 0;

    void WriteByte(byte value)
    {
        if (bufferPos == buffer.Length)
        {
            sha256.TransformBlock(buffer, 0, buffer.Length, buffer, 0);
            bufferPos = 0;
        }
        buffer[bufferPos++] = value;
    }

    void WriteLong(long value)
    {
        if (value == long.MinValue)
        {
            var minus = "-9223372036854775808"u8;
            for (int i = 0; i < minus.Length; i++) WriteByte(minus[i]);
            return;
        }
        bool negative = value < 0;
        if (negative) value = -value;
        Span<byte> digits = stackalloc byte[20];
        int start = 20;
        do
        {
            digits[--start] = (byte)('0' + value % 10);
            value /= 10;
        } while (value != 0);
        if (negative) digits[--start] = (byte)'-';
        for (int i = start; i < 20; i++) WriteByte(digits[i]);
    }

    for (int i = 0; i < count; i++)
    {
        WriteLong(sortedIds[i]);
        WriteByte((byte)',');
        WriteLong(sortedScores[i]);
        WriteByte((byte)',');
        WriteLong(sortedTimestamps[i]);
        WriteByte((byte)'\n');
    }

    if (bufferPos > 0) sha256.TransformFinalBlock(buffer, 0, bufferPos);
    else sha256.TransformFinalBlock(Array.Empty<byte>(), 0, 0);

    byte[] hash = sha256.Hash!;
    var sb = new StringBuilder(hash.Length * 2);
    for (int i = 0; i < hash.Length; i++)
    {
        sb.Append(HexChars[(hash[i] >> 4) & 0xf]);
        sb.Append(HexChars[hash[i] & 0xf]);
    }
    string checksum = sb.ToString();

    int take = Math.Min(10, count);
    var output = new StringBuilder(512);
    output.Append("{\"benchmark\":\"record-sorting\",\"version\":1,\"recordCount\":");
    output.Append(count);
    output.Append(",\"firstRecords\":[");

    for (int i = 0; i < take; i++)
    {
        if (i != 0) output.Append(',');
        output.Append("{\"id\":").Append(sortedIds[i])
               .Append(",\"score\":").Append(sortedScores[i])
               .Append(",\"timestamp\":").Append(sortedTimestamps[i]).Append('}');
    }

    output.Append("],\"lastRecords\":[");

    for (int i = count - take; i < count; i++)
    {
        if (i != count - take) output.Append(',');
        output.Append("{\"id\":").Append(sortedIds[i])
               .Append(",\"score\":").Append(sortedScores[i])
               .Append(",\"timestamp\":").Append(sortedTimestamps[i]).Append('}');
    }

    output.Append("],\"checksum\":\"").Append(checksum).Append("\"}");
    return output.ToString();
}

string? GetArg(string[] args, string name)
{
    for (int i = 0; i + 1 < args.Length; i++)
        if (args[i] == name) return args[i + 1];
    return null;
}

// --- Main entry ---
string[] cliArgs = args;
string? inputFile = GetArg(cliArgs, "--input");
string? outputFile = GetArg(cliArgs, "--output");
string? timingFile = GetArg(cliArgs, "--timing-output");
int warmup = int.Parse(GetArg(cliArgs, "--warmup") ?? "0");
int minIterations = int.Parse(GetArg(cliArgs, "--min-iterations") ?? "1");
int maxIterations = int.Parse(GetArg(cliArgs, "--max-iterations") ?? "1");
double targetCi = double.Parse(GetArg(cliArgs, "--target-relative-ci") ?? "0.05", System.Globalization.CultureInfo.InvariantCulture);

if (inputFile == null || outputFile == null || timingFile == null)
    throw new ArgumentException("missing required arguments");

string jsonText = File.ReadAllText(inputFile);
using (var doc = JsonDocument.Parse(jsonText))
{
    var root = doc.RootElement;
    var records = root.GetProperty("records");

    int count = records.GetArrayLength();
    long[] ids = new long[count];
    long[] scores = new long[count];
    long[] timestamps = new long[count];

    int idx = 0;
    foreach (var record in records.EnumerateArray())
    {
        ids[idx] = record.GetProperty("id").GetInt64();
        scores[idx] = record.GetProperty("score").GetInt64();
        timestamps[idx] = record.GetProperty("timestamp").GetInt64();
        idx++;
    }

    string? result = null;
    var sw = new Stopwatch();
    var kernelTimes = new long[maxIterations];
    int kernelCount = 0;
    var samplesBuilder = new StringBuilder("{\"samples\":[");

    for (int run = -warmup; ; run++)
    {
        sw.Restart();
        result = Kernel(ids, scores, timestamps, count);
        sw.Stop();

        long elapsed = Math.Max(1L, sw.ElapsedTicks * 1_000_000_000L / Stopwatch.Frequency);

        if (run >= 0)
        {
            kernelTimes[kernelCount++] = elapsed;
            if (kernelCount > 1) samplesBuilder.Append(',');
            samplesBuilder.Append("{\"iteration\":").Append(kernelCount)
                .Append(",\"kernelTimeNanoseconds\":").Append(elapsed).Append('}');

            long[] slice = new long[kernelCount];
            Array.Copy(kernelTimes, slice, kernelCount);
            if (kernelCount >= maxIterations || (kernelCount >= minIterations && CiWidth(slice) <= targetCi))
                break;
        }
    }

    samplesBuilder.Append("]}");

    File.WriteAllText(outputFile, result);
    File.WriteAllText(timingFile, samplesBuilder.ToString());
}
