using System;
using System.Collections.Generic;
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

    int[] srcIndex = new int[vertexCount];
    Array.Fill(srcIndex, -1);
    var groupSources = new List<int>();
    var memberLists = new List<List<int>>();
    for (int q = 0; q < queryCount; q++)
    {
        int s = querySource[q];
        if (srcIndex[s] < 0)
        {
            srcIndex[s] = groupSources.Count;
            groupSources.Add(s);
            memberLists.Add(new List<int>());
        }
        memberLists[srcIndex[s]].Add(q);
    }
    int groupCount = groupSources.Count;
    int[][] members = new int[groupCount][];
    for (int g = 0; g < groupCount; g++) members[g] = memberLists[g].ToArray();

    long[] heapDist = new long[edgeCount + 1];
    int[] heapNode = new int[edgeCount + 1];
    long[] distances = new long[vertexCount];
    int[] previous = new int[vertexCount];
    int[] seen = new int[vertexCount];
    int[] target = new int[vertexCount];
    int epoch = 0;
    int targetEpoch = 0;
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
                groupSources, members,
                heapDist, heapNode, distances, previous, seen, target, ref epoch, ref targetEpoch, path);
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
    List<int> groupSources, int[][] members,
    long[] heapDist, int[] heapNode, long[] distances, int[] previous,
    int[] seen, int[] target, ref int epoch, ref int targetEpoch, int[] path)
{
    int heapSize = 0;
    long[] outDist = new long[queryCount];
    bool[] reachable = new bool[queryCount];
    int[][] outPaths = new int[queryCount][];
    int[] outLens = new int[queryCount];

    for (int g = 0; g < groupSources.Count; g++)
    {
        int source = groupSources[g];
        int[] mem = members[g];
        int cur = ++epoch;
        int tc = ++targetEpoch;
        int remaining = 0;
        foreach (int qi in mem)
        {
            int d = queryDestination[qi];
            if (d != source && target[d] != tc) { target[d] = tc; remaining++; }
        }

        distances[source] = 0;
        seen[source] = cur;
        previous[source] = -1;
        heapSize = 0;
        Push(heapDist, heapNode, ref heapSize, 0, source);

        while (heapSize != 0 && remaining != 0)
        {
            int node = heapNode[0];
            long dist = PopDistance(heapDist, heapNode, ref heapSize);
            if (seen[node] != cur || dist != distances[node]) continue;
            if (target[node] == tc)
            {
                target[node] = 0;
                if (--remaining == 0) break;
            }

            for (int edge = offsets[node]; edge < offsets[node + 1]; edge++)
            {
                int to = destinations[edge];
                long nd = dist + weights[edge];
                if (seen[to] != cur || nd < distances[to])
                {
                    seen[to] = cur;
                    distances[to] = nd;
                    previous[to] = node;
                    Push(heapDist, heapNode, ref heapSize, nd, to);
                }
            }
        }

        foreach (int qi in mem)
        {
            int dest = queryDestination[qi];
            if (dest == source)
            {
                reachable[qi] = true;
                outDist[qi] = 0;
                outPaths[qi] = new int[] { source };
                outLens[qi] = 1;
            }
            else if (seen[dest] != cur)
            {
                reachable[qi] = false;
            }
            else
            {
                reachable[qi] = true;
                outDist[qi] = distances[dest];
                int pathLen = 0;
                for (int n = dest; ; n = previous[n])
                {
                    path[pathLen++] = n;
                    if (n == source) break;
                }
                int[] p = new int[pathLen];
                for (int i = 0; i < pathLen; i++) p[i] = path[pathLen - 1 - i];
                outPaths[qi] = p;
                outLens[qi] = pathLen;
            }
        }
    }

    var output = new StringBuilder(queryCount * 64)
        .Append("{\"benchmark\":\"shortest-path\",\"version\":1,\"results\":[");
    for (int qi = 0; qi < queryCount; qi++)
    {
        if (qi != 0) output.Append(',');
        output.Append("{\"queryId\":").Append(queryId[qi]);
        if (!reachable[qi])
        {
            output.Append(",\"distance\":null,\"path\":[]}");
            continue;
        }
        output.Append(",\"distance\":").Append(outDist[qi]).Append(",\"path\":[");
        int[] p = outPaths[qi];
        for (int i = 0; i < outLens[qi]; i++)
        {
            if (i != 0) output.Append(',');
            output.Append(p[i]);
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