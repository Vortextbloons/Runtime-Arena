using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

const string ProtocolVersion = "2.0.0";
char[] HexChars = "0123456789abcdef".ToCharArray();

static int Compare(long scoreA, long timestampA, long idA, long scoreB, long timestampB, long idB)
{
    int score = scoreB.CompareTo(scoreA);
    if (score != 0) return score;
    int timestamp = timestampA.CompareTo(timestampB);
    return timestamp != 0 ? timestamp : idA.CompareTo(idB);
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

string Kernel(long[] ids, long[] scores, long[] timestamps, int count)
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
if ((GetArg(cliArgs, "--protocol-version") ?? "") != ProtocolVersion)
    throw new ArgumentException("unsupported protocol version");

string? outputFile = GetArg(cliArgs, "--output");
if (outputFile == null)
    throw new ArgumentException("missing required arguments");

string jsonText = File.ReadAllText(GetArg(cliArgs, "--input")!);
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
            lastOutput = encoding.GetBytes(Kernel(ids, scores, timestamps, count));
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
