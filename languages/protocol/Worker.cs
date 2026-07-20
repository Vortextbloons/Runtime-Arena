using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public static class ArenaProtocol
{
    public const string Version = "2.0.0";

    public static string Arg(string[] args, string name)
    {
        for (int i = 0; i + 1 < args.Length; i++)
            if (args[i] == name) return args[i + 1];
        throw new ArgumentException("missing " + name);
    }

    public static string DigestHex(byte[] bytes) =>
        Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

    public static void EmitLine(string json)
    {
        Console.WriteLine(json);
        Console.Out.Flush();
    }

    public static string ProtocolField(string line, string field)
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

    public static void RunWorker(string[] args, string inputPath, string outputPath, Func<byte[]> kernel)
    {
        if (Arg(args, "--protocol-version") != Version)
            throw new ArgumentException("unsupported protocol version");

        File.ReadAllText(inputPath);
        EmitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + Version + "\"}");

        byte[] lastOutput = Array.Empty<byte>();
        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            if (line.Length == 0) continue;
            string type = ProtocolField(line, "type");
            if (type == "run")
            {
                long requestId = long.Parse(ProtocolField(line, "requestId"));
                lastOutput = kernel();
                EmitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
            }
            else if (type == "finish")
            {
                File.WriteAllBytes(outputPath, lastOutput);
                EmitLine("{\"type\":\"finish\",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
                break;
            }
        }
    }
}
