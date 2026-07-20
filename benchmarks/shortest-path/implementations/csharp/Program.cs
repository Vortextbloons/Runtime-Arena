using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Text.Json;

const long INF = long.MaxValue;

string? inputFile = null, outputFile = null, timingOutput = null;
int warmup = 0, minIterations = 1, maxIterations = 1;
double targetRelativeCi = 0.05;

for (int i = 0; i < args.Length - 1; i++)
{
    switch (args[i])
    {
        case "--input": inputFile = args[++i]; break;
        case "--output": outputFile = args[++i]; break;
        case "--timing-output": timingOutput = args[++i]; break;
        case "--warmup": warmup = int.Parse(args[++i]); break;
        case "--min-iterations": minIterations = int.Parse(args[++i]); break;
        case "--max-iterations": maxIterations = int.Parse(args[++i]); break;
        case "--target-relative-ci": targetRelativeCi = double.Parse(args[++i]); break;
    }
}

if (inputFile is null || outputFile is null || timingOutput is null)
    throw new ArgumentException("missing required arguments");

using (var doc = JsonDocument.Parse(File.ReadAllText(inputFile)))
{
    var root = doc.RootElement;
    int vertexCount = root.GetProperty("vertexCount").GetInt32();

    var edges = root.GetProperty("edges");
    int edgeCount = edges.GetArrayLength();

    int[] degree = new int[vertexCount];
    foreach (var edge in edges.EnumerateArray())
        degree[edge.GetProperty("from").GetInt32()]++;

    int[] offsets = new int[vertexCount + 1];
    for (int v = 0; v < vertexCount; v++)
        offsets[v + 1] = offsets[v] + degree[v];

    int[] destinations = new int[edgeCount];
    long[] weights = new long[edgeCount];
    int[] next = new int[vertexCount];
    Array.Copy(offsets, next, vertexCount);

    foreach (var edge in edges.EnumerateArray())
    {
        int from = edge.GetProperty("from").GetInt32();
        int slot = next[from]++;
        destinations[slot] = edge.GetProperty("to").GetInt32();
        weights[slot] = edge.GetProperty("weight").GetInt64();
    }

    var queriesJson = root.GetProperty("queries");
    int queryCount = queriesJson.GetArrayLength();
    int[] queryId = new int[queryCount];
    int[] querySource = new int[queryCount];
    int[] queryDestination = new int[queryCount];
    for (int q = 0; q < queryCount; q++)
    {
        var query = queriesJson[q];
        queryId[q] = query.GetProperty("id").GetInt32();
        querySource[q] = query.GetProperty("source").GetInt32();
        queryDestination[q] = query.GetProperty("destination").GetInt32();
    }

    long[] heapDist = new long[edgeCount + 1];
    int[] heapNode = new int[edgeCount + 1];
    long[] distances = new long[vertexCount];
    int[] previous = new int[vertexCount];
    int[] path = new int[vertexCount];

    string? result = null;
    var samplesBuilder = new StringBuilder("{\"samples\":[");
    long[] kernelTimes = new long[maxIterations];
    int kernelCount = 0;
    bool firstSample = true;

    for (int run = -warmup; ; run++)
    {
        var sw = Stopwatch.StartNew();
        result = Kernel(vertexCount, offsets, destinations, weights,
            queryCount, queryId, querySource, queryDestination,
            heapDist, heapNode, distances, previous, path);
        sw.Stop();
        long elapsed = Math.Max(1L, (long)((double)sw.ElapsedTicks * 1_000_000_000L / Stopwatch.Frequency));
        if (run >= 0)
        {
            kernelTimes[kernelCount++] = elapsed;
            if (!firstSample) samplesBuilder.Append(',');
            firstSample = false;
            samplesBuilder.Append("{\"iteration\":").Append(kernelCount)
                .Append(",\"kernelTimeNanoseconds\":").Append(elapsed).Append('}');
            if (kernelCount >= maxIterations || (kernelCount >= minIterations && CiWidth(kernelTimes, kernelCount) <= targetRelativeCi))
                break;
        }
    }

    File.WriteAllText(outputFile, result!);
    File.WriteAllText(timingOutput, samplesBuilder.Append("]}").ToString());
}

static string Kernel(int vertexCount, int[] offsets, int[] destinations, long[] weights,
    int queryCount, int[] queryId, int[] querySource, int[] queryDestination,
    long[] heapDist, int[] heapNode, long[] distances, int[] previous, int[] path)
{
    int heapSize = 0;
    var output = new StringBuilder(queryCount * 64)
        .Append("{\"benchmark\":\"shortest-path\",\"version\":1,\"results\":[");

    for (int qi = 0; qi < queryCount; qi++)
    {
        int source = querySource[qi];
        int dest = queryDestination[qi];

        Array.Fill(distances, INF);
        Array.Fill(previous, -1);
        heapSize = 0;

        distances[source] = 0;
        Push(heapDist, heapNode, ref heapSize, 0, source);

        while (heapSize != 0)
        {
            int node = heapNode[0];
            long dist = PopDistance(heapDist, heapNode, ref heapSize);
            if (dist != distances[node]) continue;

            for (int edge = offsets[node]; edge < offsets[node + 1]; edge++)
            {
                int to = destinations[edge];
                long nd = dist + weights[edge];
                if (nd < distances[to])
                {
                    distances[to] = nd;
                    previous[to] = node;
                    Push(heapDist, heapNode, ref heapSize, nd, to);
                }
            }
        }

        if (qi != 0) output.Append(',');
        output.Append("{\"queryId\":").Append(queryId[qi]);
        if (distances[dest] == INF)
        {
            output.Append(",\"distance\":null,\"path\":[]}");
            continue;
        }
        output.Append(",\"distance\":").Append(distances[dest]).Append(",\"path\":[");
        int pathLen = 0;
        for (int n = dest; n != -1; n = previous[n])
            path[pathLen++] = n;
        for (int i = pathLen - 1; i >= 0; i--)
        {
            if (i != pathLen - 1) output.Append(',');
            output.Append(path[i]);
        }
        output.Append("]}");
    }
    return output.Append("]}").ToString();
}

static void Push(long[] heapDist, int[] heapNode, ref int size, long distance, int node)
{
    int index = size++;
    while (index > 0)
    {
        int parent = (index - 1) >>> 1;
        if (heapDist[parent] <= distance) break;
        heapDist[index] = heapDist[parent];
        heapNode[index] = heapNode[parent];
        index = parent;
    }
    heapDist[index] = distance;
    heapNode[index] = node;
}

static long PopDistance(long[] heapDist, int[] heapNode, ref int size)
{
    long result = heapDist[0];
    int last = --size;
    if (last == 0) return result;
    long distance = heapDist[last];
    int node = heapNode[last];
    int index = 0;
    int half = last >>> 1;
    while (index < half)
    {
        int child = (index << 1) + 1;
        if (child + 1 < last && heapDist[child + 1] < heapDist[child]) child++;
        if (heapDist[child] >= distance) break;
        heapDist[index] = heapDist[child];
        heapNode[index] = heapNode[child];
        index = child;
    }
    heapDist[index] = distance;
    heapNode[index] = node;
    return result;
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