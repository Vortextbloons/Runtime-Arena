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

static (int steps, double dt, double[] mass, double[] ipx, double[] ipy, double[] ipz, double[] ivx, double[] ivy, double[] ivz) ReadInput(string path)
{
    using var doc = JsonDocument.Parse(File.ReadAllText(path));
    var root = doc.RootElement;
    int steps = root.GetProperty("steps").GetInt32();
    double dt = root.GetProperty("deltaTime").GetDouble();
    var bodiesJson = root.GetProperty("bodies");
    int count = bodiesJson.GetArrayLength();
    var mass = new double[count];
    var ipx = new double[count]; var ipy = new double[count]; var ipz = new double[count];
    var ivx = new double[count]; var ivy = new double[count]; var ivz = new double[count];
    for (int i = 0; i < count; i++)
    {
        var bj = bodiesJson[i];
        var pos = bj.GetProperty("position");
        var vel = bj.GetProperty("velocity");
        mass[i] = bj.GetProperty("mass").GetDouble();
        ipx[i] = pos[0].GetDouble(); ipy[i] = pos[1].GetDouble(); ipz[i] = pos[2].GetDouble();
        ivx[i] = vel[0].GetDouble(); ivy[i] = vel[1].GetDouble(); ivz[i] = vel[2].GetDouble();
    }
    return (steps, dt, mass, ipx, ipy, ipz, ivx, ivy, ivz);
}

static (double energy, string posChecksum, string velChecksum) Kernel(double[] mass,
    double[] px, double[] py, double[] pz, double[] vx, double[] vy, double[] vz,
    double[] ipx, double[] ipy, double[] ipz, double[] ivx, double[] ivy, double[] ivz,
    int steps, double dt)
{
    int n = mass.Length;
    Array.Copy(ipx, px, n);
    Array.Copy(ipy, py, n);
    Array.Copy(ipz, pz, n);
    Array.Copy(ivx, vx, n);
    Array.Copy(ivy, vy, n);
    Array.Copy(ivz, vz, n);
    for (int step = 0; step < steps; step++)
    {
        for (int i = 0; i < n; i++)
        {
            double pxi = px[i], pyi = py[i], pzi = pz[i], mi = mass[i];
            double vxi = vx[i], vyi = vy[i], vzi = vz[i];
            for (int j = i + 1; j < n; j++)
            {
                double dx = px[j] - pxi;
                double dy = py[j] - pyi;
                double dz = pz[j] - pzi;
                double r2 = dx * dx + dy * dy + dz * dz;
                double m = dt / (r2 * Math.Sqrt(r2));
                double mjM = mass[j] * m;
                double miM = mi * m;
                vxi += dx * mjM;
                vyi += dy * mjM;
                vzi += dz * mjM;
                vx[j] -= dx * miM;
                vy[j] -= dy * miM;
                vz[j] -= dz * miM;
            }
            vx[i] = vxi;
            vy[i] = vyi;
            vz[i] = vzi;
        }
        for (int i = 0; i < n; i++)
        {
            px[i] += dt * vx[i];
            py[i] += dt * vy[i];
            pz[i] += dt * vz[i];
        }
    }

    double energy = 0;
    var psb = new StringBuilder(n * 48);
    var vsb = new StringBuilder(n * 48);
    for (int i = 0; i < n; i++)
    {
        double vxi = vx[i], vyi = vy[i], vzi = vz[i];
        double pxi = px[i], pyi = py[i], pzi = pz[i];
        double mi = mass[i];
        energy += 0.5 * mi * (vxi * vxi + vyi * vyi + vzi * vzi);
        for (int j = i + 1; j < n; j++)
        {
            double dx = pxi - px[j];
            double dy = pyi - py[j];
            double dz = pzi - pz[j];
            energy -= mi * mass[j] / Math.Sqrt(dx * dx + dy * dy + dz * dz);
        }
        psb.Append(string.Format(CultureInfo.InvariantCulture, "{0:F9},{1:F9},{2:F9},", pxi, pyi, pzi));
        vsb.Append(string.Format(CultureInfo.InvariantCulture, "{0:F9},{1:F9},{2:F9},", vxi, vyi, vzi));
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
var (steps, dt, mass, ipx, ipy, ipz, ivx, ivy, ivz) = ReadInput(Arg("--input"));
int bodyCount = mass.Length;
var px = new double[bodyCount]; var py = new double[bodyCount]; var pz = new double[bodyCount];
var vx = new double[bodyCount]; var vy = new double[bodyCount]; var vz = new double[bodyCount];
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
        var result = Kernel(mass, px, py, pz, vx, vy, vz, ipx, ipy, ipz, ivx, ivy, ivz, steps, dt);
        string resultJson = "{\"benchmark\":\"nbody\",\"version\":1,\"bodyCount\":" + bodyCount
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
