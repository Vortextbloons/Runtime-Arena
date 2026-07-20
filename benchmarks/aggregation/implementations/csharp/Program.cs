using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;

static class Program
{
    static readonly double[] T_CRITICAL = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045];

    static readonly Comparison<Account> AccountOrder = (a, b) =>
    {
        int cmp = b.Value.CompareTo(a.Value);
        return cmp != 0 ? cmp : a.Id.CompareTo(b.Id);
    };

    static readonly Comparison<Account> WorstFirst = (a, b) =>
    {
        int cmp = a.Value.CompareTo(b.Value);
        return cmp != 0 ? cmp : b.Id.CompareTo(a.Id);
    };

    static string[] Csv(string line)
    {
        var fields = new string[5];
        int field = 0;
        int start = 0;
        bool quoted = false;
        StringBuilder quotedField = null;
        for (int i = 0; i < line.Length; i++)
        {
            char c = line[i];
            if (c == '"')
            {
                if (quoted)
                {
                    if (i + 1 < line.Length && line[i + 1] == '"')
                    {
                        if (quotedField == null) quotedField = new StringBuilder(i - start).Append(line, start, i);
                        quotedField.Append('"');
                        i++;
                    }
                    else
                    {
                        quoted = false;
                    }
                }
                else
                {
                    quoted = true;
                    quotedField = new StringBuilder();
                    if (start < i) quotedField.Append(line, start, i);
                }
            }
            else if (c == ',' && !quoted)
            {
                fields[field++] = quotedField == null ? line[start..i] : quotedField.ToString();
                quotedField = null;
                start = i + 1;
            }
            else if (quotedField != null)
            {
                quotedField.Append(c);
            }
        }
        fields[field] = quotedField == null ? line[start..] : quotedField.ToString();
        return fields;
    }

    static Row[] ReadRows(string path)
    {
        var rows = new List<Row>();
        using var reader = new StreamReader(path, Encoding.UTF8);
        reader.ReadLine(); // skip header
        string line;
        while ((line = reader.ReadLine()) != null)
        {
            var f = Csv(line);
            rows.Add(new Row(f[1], f[2], long.Parse(f[3]), long.Parse(f[4])));
        }
        return rows.ToArray();
    }

    static string Escaped(string value)
    {
        var sb = new StringBuilder(value.Length + 2);
        sb.Append('"');
        foreach (char c in value)
        {
            if (c == '"') sb.Append("\\\"");
            else if (c == '\\') sb.Append("\\\\");
            else if (c == '\n') sb.Append("\\n");
            else if (c == '\r') sb.Append("\\r");
            else if (c == '\t') sb.Append("\\t");
            else sb.Append(c);
        }
        sb.Append('"');
        return sb.ToString();
    }

    static string CategoriesJson(List<Category> categories)
    {
        var sb = new StringBuilder("[");
        for (int i = 0; i < categories.Count; i++)
        {
            if (i != 0) sb.Append(',');
            var c = categories[i];
            sb.Append("{\"category\":").Append(Escaped(c.Name))
              .Append(",\"quantity\":").Append(c.Quantity)
              .Append(",\"valueMinorUnits\":").Append(c.Value).Append('}');
        }
        sb.Append(']');
        return sb.ToString();
    }

    static string AccountsJson(List<Account> accounts)
    {
        var sb = new StringBuilder("[");
        for (int i = 0; i < accounts.Count; i++)
        {
            if (i != 0) sb.Append(',');
            var a = accounts[i];
            sb.Append("{\"accountId\":").Append(Escaped(a.Id))
              .Append(",\"valueMinorUnits\":").Append(a.Value).Append('}');
        }
        sb.Append(']');
        return sb.ToString();
    }

    static string Hex(byte[] digest)
    {
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

    static Result Kernel(Row[] rows)
    {
        var categoriesByName = new Dictionary<string, Category>();
        var accountsById = new Dictionary<string, Account>();
        var result = new Result
        {
            Min = long.MaxValue,
            Max = 0
        };

        foreach (var row in rows)
        {
            long value = row.Quantity * row.UnitPrice;
            result.Count++;
            result.Quantity += row.Quantity;
            result.Value += value;
            if (value < result.Min) result.Min = value;
            if (value > result.Max) result.Max = value;

            if (!categoriesByName.TryGetValue(row.Category, out var category))
            {
                category = new Category(row.Category);
                categoriesByName[row.Category] = category;
            }
            category.Quantity += row.Quantity;
            category.Value += value;

            if (!accountsById.TryGetValue(row.Account, out var account))
            {
                account = new Account(row.Account);
                accountsById[row.Account] = account;
            }
            account.Value += value;
        }

        var cats = new List<Category>(categoriesByName.Values);
        cats.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.Ordinal));

        var top = new List<Account>(16);
        foreach (var account in accountsById.Values)
        {
            if (top.Count < 10)
            {
                top.Add(account);
                if (top.Count == 10)
                    top.Sort(WorstFirst);
            }
            else if (AccountOrder(account, top[0]) < 0)
            {
                top[0] = account;
                top.Sort(WorstFirst);
            }
        }

        top.Sort(AccountOrder);

        var checksumInput = "{\"Categories\":" + CategoriesJson(cats)
            + ",\"TopAccounts\":" + AccountsJson(top) + "}\n";
        result.Categories = cats;
        result.TopAccounts = top;
        result.Checksum = Hex(SHA256.HashData(Encoding.UTF8.GetBytes(checksumInput)));
        return result;
    }

    static string Output(Result r)
    {
        return "{\"benchmark\":\"aggregation\",\"version\":1,\"recordCount\":" + r.Count
            + ",\"totalQuantity\":" + r.Quantity + ",\"totalValueMinorUnits\":" + r.Value
            + ",\"categories\":" + CategoriesJson(r.Categories)
            + ",\"topAccounts\":" + AccountsJson(r.TopAccounts)
            + ",\"minimumTransactionMinorUnits\":" + r.Min
            + ",\"maximumTransactionMinorUnits\":" + r.Max
            + ",\"checksum\":\"" + r.Checksum + "\"}";
    }

    static double CiWidth(long[] samples)
    {
        int n = samples.Length;
        if (n < 2) return double.PositiveInfinity;
        double mean = 0;
        foreach (long v in samples) mean += v;
        mean /= n;
        if (mean <= 0) return double.PositiveInfinity;
        double variance = 0;
        foreach (long v in samples)
        {
            double delta = v - mean;
            variance += delta * delta;
        }
        variance /= (n - 1);
        double t = n < T_CRITICAL.Length ? T_CRITICAL[n] : 2.0;
        return (2 * t * Math.Sqrt(variance / n)) / mean;
    }

    static string Arg(string[] args, string name, string fallback)
    {
        for (int i = 0; i + 1 < args.Length; i++)
            if (args[i] == name) return args[i + 1];
        return fallback;
    }

    static void Main(string[] args)
    {
        string input = Arg(args, "--input", "");
        string output = Arg(args, "--output", "");
        string timing = Arg(args, "--timing-output", "");
        int warmup = int.Parse(Arg(args, "--warmup", "0"));
        int minIterations = int.Parse(Arg(args, "--min-iterations", "1"));
        int maxIterations = int.Parse(Arg(args, "--max-iterations", "1"));
        double targetCi = double.Parse(Arg(args, "--target-relative-ci", "0.05"));

        if (string.IsNullOrEmpty(input) || string.IsNullOrEmpty(output) || string.IsNullOrEmpty(timing))
            throw new ArgumentException("missing required arguments");

        var rows = ReadRows(input);

        Result last = null!;
        var sw = new Stopwatch();
        var sb = new StringBuilder("{\"samples\":[");
        int measured = 0;
        var kernelTimes = new long[maxIterations];
        int kernelCount = 0;

        for (int run = -warmup; ; run++)
        {
            sw.Restart();
            last = Kernel(rows);
            sw.Stop();
            long elapsed = Math.Max(1L, sw.ElapsedTicks * (1000000000L / Stopwatch.Frequency));

            if (run >= 0)
            {
                kernelTimes[kernelCount++] = elapsed;
                if (measured++ != 0) sb.Append(',');
                sb.Append("{\"iteration\":").Append(measured)
                  .Append(",\"kernelTimeNanoseconds\":").Append(elapsed).Append('}');
                if (kernelCount >= maxIterations || (kernelCount >= minIterations && CiWidth(kernelTimes[..kernelCount]) <= targetCi))
                    break;
            }
        }

        File.WriteAllText(output, Output(last), Encoding.UTF8);
        File.WriteAllText(timing, sb.Append("]}").ToString(), Encoding.UTF8);
    }
}

record Row(string Account, string Category, long Quantity, long UnitPrice);

class Category(string name)
{
    public string Name = name;
    public long Quantity;
    public long Value;
}

class Account(string id)
{
    public string Id = id;
    public long Value;
}

class Result
{
    public long Count;
    public long Quantity;
    public long Value;
    public long Min;
    public long Max;
    public List<Category> Categories = null!;
    public List<Account> TopAccounts = null!;
    public string Checksum = null!;
}
