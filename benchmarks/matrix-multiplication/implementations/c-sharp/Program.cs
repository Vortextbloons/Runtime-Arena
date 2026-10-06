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
long[] transposed = new long[elements];
long valueSum = 0;
long diagonalSum = 0;

static void Transpose(int n, long[] right, long[] transposed)
{
    for (int ii = 0; ii < n; ii += 32)
    {
        int iMax = Math.Min(ii + 32, n);
        for (int jj = 0; jj < n; jj += 32)
        {
            int jMax = Math.Min(jj + 32, n);
            for (int i = ii; i < iMax; i++)
            {
                int base_ = i * n;
                for (int j = jj; j < jMax; j++) transposed[j * n + i] = right[base_ + j];
            }
        }
    }
}

static void Multiply(int n, long[] left, long[] transposed, long[] product, out long valueSum, out long diagonalSum)
{
    valueSum = 0;
    diagonalSum = 0;
    int kLim = n & ~3;
    for (int i = 0; i < n; i++)
    {
        int aBase = i * n;
        int cBase = i * n;
        long rowSum = 0;
        for (int j = 0; j < n; j++)
        {
            int bBase = j * n;
            long s0 = 0, s1 = 0, s2 = 0, s3 = 0;
            int k = 0;
            for (; k < kLim; k += 4)
            {
                s0 += left[aBase + k] * transposed[bBase + k];
                s1 += left[aBase + k + 1] * transposed[bBase + k + 1];
                s2 += left[aBase + k + 2] * transposed[bBase + k + 2];
                s3 += left[aBase + k + 3] * transposed[bBase + k + 3];
            }
            long s = (s0 + s1) + (s2 + s3);
            for (; k < n; k++) s += left[aBase + k] * transposed[bBase + k];
            product[cBase + j] = s;
            rowSum += s;
            if (i == j) diagonalSum += s;
        }
        valueSum += rowSum;
    }
}

static void AppendLong(byte[] buf, ref int pos, long v)
{
    if (v == 0) { buf[pos++] = (byte)'0'; buf[pos++] = (byte)','; return; }
    if (v < 0) { buf[pos++] = (byte)'-'; v = -v; }
    Span<byte> tmp = stackalloc byte[20];
    int len = 0;
    while (v > 0) { tmp[len++] = (byte)('0' + v % 10); v /= 10; }
    while (len > 0) buf[pos++] = tmp[--len];
    buf[pos++] = (byte)',';
}

static string Checksum(int n, long[] product)
{
    // Fast path: values are small, but size generously for any int64.
    byte[] buf = new byte[(n * n) * 24 + 64];
    int pos = 0;
    foreach (byte ch in "dimension="u8) buf[pos++] = ch;
    AppendLong(buf, ref pos, n);
    pos--; // AppendLong adds a ','; header needs '\n' instead
    buf[pos++] = (byte)'\n';
    foreach (long v in product) AppendLong(buf, ref pos, v);
    buf[pos++] = (byte)'\n';
    byte[] hash = SHA256.HashData(buf.AsSpan(0, pos));
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
        Transpose(n, right, transposed);
        Multiply(n, left, transposed, product, out valueSum, out diagonalSum);
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
