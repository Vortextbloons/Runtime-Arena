import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CyclicBarrier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class Main {
  private static final String PROTOCOL_VERSION = "2.0.0";
  private static final int WORKER_MUL = 0x9e3779b9;
  private static final int ROUND_MUL = 0x9e3779b1;
  private static final int ROUND_ADD = 0x85ebca77;
  private static final long INITIAL_DIGEST = 0x6a09e667f3bcc909L;
  private static final char[] HEX = "0123456789abcdef".toCharArray();
  private static final Pattern NUMBER = Pattern.compile("\\\"([A-Za-z0-9]+)\\\"\\s*:\\s*(?:\\\"([0-9a-fA-F]+)\\\"|([0-9]+))");

  private static final class Input {
    int workers, phases, items, rounds;
    long seed;
  }

  private static final class Pool {
    final int workers, items, rounds;
    final int[] seeds;
    final int[] xors;
    final long[] sums;
    final int[] workerBases;
    final int[] workerMixes;
    final Thread[] threads;
    final CyclicBarrier dispatch;
    final CyclicBarrier complete;
    volatile boolean stopping;

    Pool(int workerCount, int items, int rounds) {
      workers = workerCount; this.items = items; this.rounds = rounds;
      seeds = new int[workerCount]; xors = new int[workerCount]; sums = new long[workerCount];
      workerBases = new int[workerCount]; workerMixes = new int[workerCount]; threads = new Thread[workerCount];
      dispatch = new CyclicBarrier(workerCount + 1);
      complete = new CyclicBarrier(workerCount + 1);
      for (int id = 0; id < workerCount; id++) {
        workerBases[id] = id * items;
        workerMixes[id] = id * WORKER_MUL;
        final int workerId = id;
        threads[id] = new Thread(() -> run(workerId), "barrier-wave-" + id);
        threads[id].start();
      }
    }

    private void run(int id) {
      try {
        while (true) {
          dispatch.await();
          if (stopping) return;
          int seed = seeds[id];
          int localXor = 0;
          long localSum = 0;
          int globalItemId = workerBases[id];
          int workerMix = workerMixes[id];
          for (int item = 0; item < items; item++, globalItemId++) {
            int x = seed ^ globalItemId ^ workerMix;
            for (int round = 0; round < rounds; round++) {
              x ^= x << 13;
              x ^= x >>> 17;
              x ^= x << 5;
              x = x * ROUND_MUL + ROUND_ADD;
            }
            localXor ^= x;
            localSum += x & 0xffffffffL;
          }
          xors[id] = localXor;
          sums[id] = localSum;
          complete.await();
        }
      } catch (Exception exception) {
        throw new RuntimeException(exception);
      }
    }

    void close() throws Exception {
      stopping = true;
      dispatch.await();
      for (Thread thread : threads) thread.join();
    }
  }

  private static int mix(int value) {
    value ^= value >>> 16;
    value *= 0x21f0aaad;
    value ^= value >>> 15;
    value *= 0x735a2d97;
    value ^= value >>> 15;
    return value;
  }

  private static long rotateLeft(long value) { return (value << 7) | (value >>> 57); }

  private static String hex(long value, int digits) {
    char[] result = new char[digits];
    for (int i = digits - 1; i >= 0; i--) {
      result[i] = HEX[(int) (value & 15L)];
      value >>>= 4;
    }
    return new String(result);
  }

  private static long number(String raw, String key) {
    Matcher matcher = NUMBER.matcher(raw);
    while (matcher.find()) {
      if (!matcher.group(1).equals(key)) continue;
      return Long.parseLong(matcher.group(2) != null ? matcher.group(2) : matcher.group(3),
          key.equals("initialSeed") ? 16 : 10);
    }
    throw new IllegalArgumentException("missing " + key);
  }

  private static Input read(String path) throws IOException {
    String raw = Files.readString(Path.of(path), StandardCharsets.UTF_8);
    Input input = new Input();
    input.workers = (int) number(raw, "workerCount");
    input.phases = (int) number(raw, "phaseCount");
    input.items = (int) number(raw, "itemsPerWorker");
    input.rounds = (int) number(raw, "roundsPerItem");
    input.seed = number(raw, "initialSeed");
    return input;
  }

  private static String[] kernel(Input input, Pool pool) {
    int phaseSeed = (int) input.seed;
    long digest = INITIAL_DIGEST;
    for (int phase = 0; phase < input.phases; phase++) {
      for (int worker = 0; worker < input.workers; worker++) pool.seeds[worker] = phaseSeed;
      try {
        pool.dispatch.await();
        pool.complete.await();
      } catch (Exception exception) {
        throw new RuntimeException(exception);
      }
      int nextSeed = phaseSeed ^ phase;
      long phaseSum = 0;
      for (int worker = 0; worker < input.workers; worker++) {
        long localSum = pool.sums[worker];
        nextSeed = mix(nextSeed ^ pool.xors[worker] ^ (int) localSum ^ (int) (localSum >>> 32) ^ worker);
        phaseSum += localSum;
      }
      phaseSeed = nextSeed;
      digest = rotateLeft(digest) ^ (phaseSeed & 0xffffffffL);
      digest += phaseSum;
    }
    return new String[] { hex(phaseSeed & 0xffffffffL, 8), hex(digest, 16) };
  }

  private static String argument(String[] args, String name, String fallback) {
    for (int i = 0; i + 1 < args.length; i++) if (args[i].equals(name)) return args[i + 1];
    return fallback;
  }

  private static String digestHex(byte[] bytes) throws Exception {
    java.security.MessageDigest digest = java.security.MessageDigest.getInstance("SHA-256");
    byte[] hash = digest.digest(bytes);
    char[] result = new char[hash.length * 2];
    for (int i = 0; i < hash.length; i++) {
      int value = hash[i] & 0xff;
      result[i * 2] = HEX[value >>> 4];
      result[i * 2 + 1] = HEX[value & 15];
    }
    return new String(result);
  }

  private static void emitLine(String json) {
    System.out.println(json);
    System.out.flush();
  }

  private static String protocolField(String line, String field) {
    String key = "\"" + field + "\":";
    int start = line.indexOf(key);
    if (start < 0) return null;
    start += key.length();
    while (start < line.length() && line.charAt(start) == ' ') start++;
    if (line.charAt(start) == '"') {
      int end = line.indexOf('"', start + 1);
      return line.substring(start + 1, end);
    }
    int end = start;
    while (end < line.length() && ",} ".indexOf(line.charAt(end)) < 0) end++;
    return line.substring(start, end);
  }

  public static void main(String[] args) throws Exception {
    if (!PROTOCOL_VERSION.equals(argument(args, "--protocol-version", ""))) {
      throw new IllegalArgumentException("unsupported protocol version");
    }
    String outputFile = argument(args, "--output", null);
    if (outputFile == null) throw new IllegalArgumentException("missing required arguments");

    Input input = read(argument(args, "--input", null));
    Pool pool = new Pool(input.workers, input.items, input.rounds);
    try {
      emitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + PROTOCOL_VERSION + "\"}");
      BufferedReader stdin = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
      byte[] lastOutput = new byte[0];
      String line;
      while ((line = stdin.readLine()) != null) {
        if (line.isEmpty()) continue;
        String type = protocolField(line, "type");
        if ("run".equals(type)) {
          long requestId = Long.parseLong(protocolField(line, "requestId"));
          String[] result = kernel(input, pool);
          String json = "{\"schemaVersion\":\"1.0.0\",\"benchmark\":\"barrier-wave\",\"workerCount\":"
              + input.workers + ",\"phaseCount\":" + input.phases + ",\"itemsProcessed\":"
              + (long) input.workers * input.phases * input.items + ",\"finalSeed\":\"" + result[0]
              + "\",\"digest\":\"" + result[1] + "\"}";
          lastOutput = json.getBytes(StandardCharsets.UTF_8);
          emitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + digestHex(lastOutput) + "\"}");
        } else if ("finish".equals(type)) {
          Files.write(Path.of(outputFile), lastOutput);
          emitLine("{\"type\":\"finish\",\"digest\":\"" + digestHex(lastOutput) + "\"}");
          break;
        }
      }
    } finally {
      pool.close();
    }
  }
}
