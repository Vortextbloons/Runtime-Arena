using System;
using System.Globalization;
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

static string Hash(string s)
{
    byte[] digest = SHA256.HashData(Encoding.UTF8.GetBytes(s));
    const string hex = "0123456789abcdef";
    char[] result = new char[digest.Length * 2];
    for (int i = 0; i < digest.Length; i++)
    {
        int v = digest[i] & 0xff;
        result[i * 2] = hex[v >> 4];
        result[i * 2 + 1] = hex[v & 15];
    }
    return new string(result);
}

static Body[] ReadInput(string path, out int steps, out double dt)
{
    using var doc = JsonDocument.Parse(File.ReadAllText(path));
    var root = doc.RootElement;
    steps = root.GetProperty("steps").GetInt32();
    dt = root.GetProperty("deltaTime").GetDouble();
    var bodiesJson = root.GetProperty("bodies");
    int count = bodiesJson.GetArrayLength();
    var bodies = new Body[count];
    for (int i = 0; i < count; i++)
    {
        var bj = bodiesJson[i];
        var pos = bj.GetProperty("position");
        var vel = bj.GetProperty("velocity");
        bodies[i] = new Body
        {
            Mass = bj.GetProperty("mass").GetDouble(),
            Px = pos[0].GetDouble(), Py = pos[1].GetDouble(), Pz = pos[2].GetDouble(),
            Vx = vel[0].GetDouble(), Vy = vel[1].GetDouble(), Vz = vel[2].GetDouble(),
        };
    }
    return bodies;
}

static (double energy, string posChecksum, string velChecksum) Kernel(Body[] b, int steps, double dt)
{
    int n = b.Length;
    for (int step = 0; step < steps; step++)
    {
        for (int i = 0; i < n; i++)
        {
            for (int j = i + 1; j < n; j++)
            {
                double dx = b[j].Px - b[i].Px;
                double dy = b[j].Py - b[i].Py;
                double dz = b[j].Pz - b[i].Pz;
                double r2 = dx * dx + dy * dy + dz * dz;
                double m = dt / (r2 * Math.Sqrt(r2));
                double mjM = b[j].Mass * m;
                double miM = b[i].Mass * m;
                b[i].Vx += dx * mjM;
                b[i].Vy += dy * mjM;
                b[i].Vz += dz * mjM;
                b[j].Vx -= dx * miM;
                b[j].Vy -= dy * miM;
                b[j].Vz -= dz * miM;
            }
        }
        for (int i = 0; i < n; i++)
        {
            b[i].Px += dt * b[i].Vx;
            b[i].Py += dt * b[i].Vy;
            b[i].Pz += dt * b[i].Vz;
        }
    }

    double energy = 0;
    var psb = new StringBuilder();
    var vsb = new StringBuilder();
    for (int i = 0; i < n; i++)
    {
        energy += 0.5 * b[i].Mass * (b[i].Vx * b[i].Vx + b[i].Vy * b[i].Vy + b[i].Vz * b[i].Vz);
        for (int j = i + 1; j < n; j++)
        {
            double dx = b[i].Px - b[j].Px;
            double dy = b[i].Py - b[j].Py;
            double dz = b[i].Pz - b[j].Pz;
            energy -= b[i].Mass * b[j].Mass / Math.Sqrt(dx * dx + dy * dy + dz * dz);
        }
        psb.Append(string.Format(CultureInfo.InvariantCulture, "{0:F9},{1:F9},{2:F9},", b[i].Px, b[i].Py, b[i].Pz));
        vsb.Append(string.Format(CultureInfo.InvariantCulture, "{0:F9},{1:F9},{2:F9},", b[i].Vx, b[i].Vy, b[i].Vz));
    }
    return (energy, Hash(psb.ToString()), Hash(vsb.ToString()));
}

string Arg(string name)
{
    for (int i = 0; i + 1 < args.Length; i++)
        if (args[i] == name) return args[i + 1];
    throw new ArgumentException("missing " + name);
}

if (Arg("--protocol-version") != ProtocolVersion)
    throw new ArgumentException("unsupported protocol version");

string outputFile = Arg("--output");
Body[] initial = ReadInput(Arg("--input"), out int steps, out double dt);
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
        var b = new Body[initial.Length];
        Array.Copy(initial, b, initial.Length);
        var result = Kernel(b, steps, dt);
        string resultJson = "{\"benchmark\":\"nbody\",\"version\":1,\"bodyCount\":" + b.Length
            + ",\"finalEnergy\":" + result.energy.ToString(CultureInfo.InvariantCulture)
            + ",\"positionChecksum\":\"" + result.posChecksum
            + "\",\"velocityChecksum\":\"" + result.velChecksum + "\"}";
        lastOutput = encoding.GetBytes(resultJson);
        EmitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
    }
    else if (type == "finish")
    {
        File.WriteAllBytes(outputFile, lastOutput);
        EmitLine("{\"type\":\"finish\",\"digest\":\"" + DigestHex(lastOutput) + "\"}");
        break;
    }
}

struct Body
{
    public double Mass, Px, Py, Pz, Vx, Vy, Vz;
}
