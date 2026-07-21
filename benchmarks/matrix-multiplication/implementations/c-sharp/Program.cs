using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

const string ProtocolVersion = "2.0.0";

var cliArgs = Environment.GetCommandLineArgs();
static string Arg(string[] a, string name)
{
    for (int i = 1; i + 1 < a.Length; i++)
        if (a[i] == name) return a[i + 1];
    throw new ArgumentException("missing argument " + name);
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

if (Arg(cliArgs, "--protocol-version") != ProtocolVersion)
    throw new ArgumentException("unsupported protocol version");

string outputPath = Arg(cliArgs, "--output");
string jsonText = File.ReadAllText(Arg(cliArgs, "--input"));
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
            product[outputBase + j] = 0;
        for (int k = 0; k < n; k++)
        {
            long a_ik = left[leftBase + k];
            int rightBase = k * n;
            for (int j = 0; j < n; j++)
                product[outputBase + j] += a_ik * right[rightBase + j];
        }
        for (int j = 0; j < n; j++)
        {
            valueSum += product[outputBase + j];
            if (i == j) diagonalSum += product[outputBase + j];
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
        Multiply(n, left, right, product, out valueSum, out diagonalSum);
        string cs = Checksum(n, product);
        lastOutput = encoding.GetBytes(OutputJson(n, elements, valueSum, diagonalSum, cs));
        EmitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
    }
    else if (type == "finish")
    {
        File.WriteAllBytes(outputPath, lastOutput);
        EmitLine("{\"type\":\"finish\",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
        break;
    }
}
