using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

double[] T_CRITICAL = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045];

double CiWidth(long[] samples, int count)
{
    if (count < 2) return double.PositiveInfinity;
    double mean = 0;
    for (int i = 0; i < count; i++) mean += samples[i];
    mean /= count;
    if (mean <= 0) return double.PositiveInfinity;
    double variance = 0;
    for (int i = 0; i < count; i++)
    {
        double delta = samples[i] - mean;
        variance += delta * delta;
    }
    variance /= (count - 1);
    double t = count < T_CRITICAL.Length ? T_CRITICAL[count] : 2.0;
    return (2 * t * Math.Sqrt(variance / count)) / mean;
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

string inputFile = Arg("--input");
string outputFile = Arg("--output");
string timingFile = Arg("--timing-output");
int warmup = int.Parse(Arg("--warmup"));
int minIterations = int.Parse(Arg("--min-iterations"));
int maxIterations = int.Parse(Arg("--max-iterations"));
double targetRelativeCi = double.Parse(Arg("--target-relative-ci"), CultureInfo.InvariantCulture);

Body[] initial = ReadInput(inputFile, out int steps, out double dt);

long[] kernelTimes = new long[maxIterations];
int kernelCount = 0;
int measured = 0;
double finalEnergy = 0;
string posChecksum = "", velChecksum = "";
int bodyCount = initial.Length;
var samples = new StringBuilder("{\"samples\":[");

for (int run = -warmup; ; run++)
{
    var b = new Body[initial.Length];
    Array.Copy(initial, b, initial.Length);

    var sw = Stopwatch.StartNew();
    var result = Kernel(b, steps, dt);
    sw.Stop();
    long elapsed = Math.Max(1L, sw.ElapsedTicks * (1000000000L / Stopwatch.Frequency));

    finalEnergy = result.energy;
    posChecksum = result.posChecksum;
    velChecksum = result.velChecksum;

    if (run >= 0)
    {
        kernelTimes[kernelCount++] = elapsed;
        if (measured++ != 0) samples.Append(',');
        samples.Append("{\"iteration\":").Append(measured)
               .Append(",\"kernelTimeNanoseconds\":").Append(elapsed).Append('}');
        if (kernelCount >= maxIterations || (kernelCount >= minIterations && CiWidth(kernelTimes, kernelCount) <= targetRelativeCi))
            break;
    }
}

samples.Append("]}");

string resultJson = "{\"benchmark\":\"nbody\",\"version\":1,\"bodyCount\":" + bodyCount
    + ",\"finalEnergy\":" + finalEnergy.ToString(CultureInfo.InvariantCulture)
    + ",\"positionChecksum\":\"" + posChecksum
    + "\",\"velocityChecksum\":\"" + velChecksum + "\"}";
File.WriteAllText(outputFile, resultJson, new UTF8Encoding(false));
File.WriteAllText(timingFile, samples.ToString(), new UTF8Encoding(false));

struct Body
{
    public double Mass, Px, Py, Pz, Vx, Vy, Vz;
}
