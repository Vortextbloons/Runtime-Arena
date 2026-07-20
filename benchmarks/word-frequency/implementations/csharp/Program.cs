using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

string? input = null, output = null, timingOutput = null;
int warmup = 0, minIterations = 1, maxIterations = 1;
double targetRelativeCi = 0.05;

for (int i = 0; i < args.Length - 1; i++)
{
    switch (args[i])
    {
        case "--input": input = args[++i]; break;
        case "--output": output = args[++i]; break;
        case "--timing-output": timingOutput = args[++i]; break;
        case "--warmup": warmup = int.Parse(args[++i]); break;
        case "--min-iterations": minIterations = int.Parse(args[++i]); break;
        case "--max-iterations": maxIterations = int.Parse(args[++i]); break;
        case "--target-relative-ci": targetRelativeCi = double.Parse(args[++i]); break;
    }
}

if (input is null || output is null || timingOutput is null)
    throw new ArgumentException("missing required arguments");

string inputJson = File.ReadAllText(input);
using (var doc = JsonDocument.Parse(inputJson))
{
    var words = doc.RootElement.GetProperty("words");
    int totalWords = words.GetArrayLength();
    string[] wordArray = new string[totalWords];
    int idx = 0;
    foreach (var w in words)
        wordArray[idx++] = w.GetString()!;

    string? result = null;
    var samplesBuilder = new StringBuilder("{\"samples\":[");
    long[] kernelTimes = new long[maxIterations];
    int kernelCount = 0;
    bool first = true;

    for (int run = -warmup; ; run++)
    {
        var sw = Stopwatch.StartNew();
        result = Kernel(wordArray);
        sw.Stop();
        long elapsed = Math.Max(1L, (long)((double)sw.ElapsedTicks * 1_000_000_000L / Stopwatch.Frequency));
        if (run >= 0)
        {
            kernelTimes[kernelCount++] = elapsed;
            if (!first) samplesBuilder.Append(',');
            first = false;
            samplesBuilder.Append("{\"iteration\":").Append(kernelCount)
                .Append(",\"kernelTimeNanoseconds\":").Append(elapsed).Append('}');
            if (kernelCount >= maxIterations || (kernelCount >= minIterations && CiWidth(kernelTimes, kernelCount) <= targetRelativeCi))
                break;
        }
    }

    File.WriteAllText(output, result!);
    File.WriteAllText(timingOutput, samplesBuilder.Append("]}").ToString());
}

static string Kernel(string[] words)
{
    var counts = new Dictionary<string, int>();
    foreach (var word in words)
    {
        if (counts.TryGetValue(word, out int c))
            counts[word] = c + 1;
        else
            counts[word] = 1;
    }

    var entries = new List<KeyValuePair<string, int>>(counts);
    entries.Sort((a, b) =>
    {
        int cmp = b.Value.CompareTo(a.Value);
        return cmp != 0 ? cmp : string.Compare(a.Key, b.Key, StringComparison.Ordinal);
    });

    var checksumBuilder = new StringBuilder(entries.Count * 16);
    foreach (var entry in entries)
        checksumBuilder.Append(entry.Key).Append(',').Append(entry.Value).Append('\n');
    byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes(checksumBuilder.ToString()));
    string checksum = Convert.ToHexString(hash).ToLowerInvariant();

    var output = new StringBuilder(512)
        .Append("{\"benchmark\":\"word-frequency\",\"version\":1,\"totalWords\":")
        .Append(words.Length).Append(",\"uniqueWords\":").Append(entries.Count)
        .Append(",\"topWords\":[");
    int take = Math.Min(10, entries.Count);
    for (int i = 0; i < take; i++)
    {
        if (i != 0) output.Append(',');
        output.Append("{\"word\":").Append(JsonEncodedText.Encode(entries[i].Key).ToString())
            .Append(",\"count\":").Append(entries[i].Value).Append('}');
    }
    return output.Append("],\"checksum\":\"").Append(checksum).Append("\"}").ToString();
}

static double CiWidth(long[] samples, int n)
{
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
    double[] tCritical = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045];
    double t = n < tCritical.Length ? tCritical[n] : 2.0;
    return (2 * t * Math.Sqrt(variance / n)) / mean;
}
