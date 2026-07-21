using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

const string ProtocolVersion = "2.0.0";
const long INF = long.MaxValue;

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

string? inputFile = null, outputFile = null;
for (int i = 0; i < args.Length - 1; i++)
{
    switch (args[i])
    {
        case "--input": inputFile = args[++i]; break;
        case "--output": outputFile = args[++i]; break;
        case "--protocol-version":
            if (args[++i] != ProtocolVersion) throw new ArgumentException("unsupported protocol version");
            break;
    }
}

if (inputFile is null || outputFile is null)
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

    var encoding = new UTF8Encoding(false);
    byte[] lastOutput = Array.Empty<byte>();

    EmitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + ProtocolVersion + "\"}");
    string? line;
    while ((line = Console.ReadLine()) != null)
    {
        if (line.Length == 0) continue;
        string type = ProtocolField(line, "type");
        if (type == "run")
        {
            long requestId = long.Parse(ProtocolField(line, "requestId"));
            string result = Kernel(vertexCount, offsets, destinations, weights,
                queryCount, queryId, querySource, queryDestination,
                heapDist, heapNode, distances, previous, path);
            lastOutput = encoding.GetBytes(result);
            EmitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
        }
        else if (type == "finish")
        {
            File.WriteAllBytes(outputFile, lastOutput);
            EmitLine("{\"type\":\"finish\",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
            break;
        }
    }
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
            if (node == dest) break;

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