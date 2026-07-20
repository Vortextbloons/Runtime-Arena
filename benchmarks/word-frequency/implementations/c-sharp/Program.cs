using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

const string ProtocolVersion = "2.0.0";

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

static string GetArg(string[] cliArgs, string name)
{
    for (int i = 0; i + 1 < cliArgs.Length; i++)
        if (cliArgs[i] == name) return cliArgs[i + 1];
    throw new ArgumentException("missing " + name);
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
        output.Append("{\"word\":").Append(JsonSerializer.Serialize(entries[i].Key))
            .Append(",\"count\":").Append(entries[i].Value).Append('}');
    }
    return output.Append("],\"checksum\":\"").Append(checksum).Append("\"}").ToString();
}

string[] cliArgs = args;
if (GetArg(cliArgs, "--protocol-version") != ProtocolVersion)
    throw new ArgumentException("unsupported protocol version");

string outputFile = GetArg(cliArgs, "--output");
string inputFile = GetArg(cliArgs, "--input");

using (var doc = JsonDocument.Parse(File.ReadAllText(inputFile)))
{
    var words = doc.RootElement.GetProperty("words");
    int totalWords = words.GetArrayLength();
    string[] wordArray = new string[totalWords];
    int idx = 0;
    foreach (var w in words.EnumerateArray())
        wordArray[idx++] = w.GetString()!;

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
            lastOutput = encoding.GetBytes(Kernel(wordArray));
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
