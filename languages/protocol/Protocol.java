import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;

public final class ArenaProtocol {
    public static final String VERSION = "2.0.0";

    private ArenaProtocol() {}

    public static String arg(String[] args, String name) {
        for (int i = 0; i + 1 < args.length; i++) {
            if (args[i].equals(name)) return args[i + 1];
        }
        throw new IllegalArgumentException("missing " + name);
    }

    public static String digestHex(byte[] bytes) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] hash = digest.digest(bytes);
        StringBuilder builder = new StringBuilder(hash.length * 2);
        for (byte value : hash) builder.append(String.format("%02x", value));
        return builder.toString();
    }

    public static void emitLine(String json) {
        System.out.println(json);
        System.out.flush();
    }

    public static String protocolField(String line, String field) {
        String key = "\"" + field + "\":";
        int start = line.indexOf(key);
        if (start < 0) return "";
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

    public interface Kernel {
        byte[] run() throws Exception;
    }

    public static void runWorker(String[] args, String inputPath, String outputPath, Kernel kernel) throws Exception {
        if (!VERSION.equals(arg(args, "--protocol-version"))) {
            throw new IllegalArgumentException("unsupported protocol version");
        }
        Files.readString(Path.of(inputPath));
        emitLine("{\"type\":\"ready\",\"protocolVersion\":\"" + VERSION + "\"}");

        byte[] lastOutput = new byte[0];
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        String line;
        while ((line = reader.readLine()) != null) {
            if (line.isEmpty()) continue;
            String type = protocolField(line, "type");
            if ("run".equals(type)) {
                long requestId = Long.parseLong(protocolField(line, "requestId"));
                lastOutput = kernel.run();
                emitLine("{\"type\":\"result\",\"requestId\":" + requestId + ",\"digest\":\"" + digestHex(lastOutput) + "\"}");
            } else if ("finish".equals(type)) {
                Files.write(Path.of(outputPath), lastOutput);
                emitLine("{\"type\":\"finish\",\"digest\":\"" + digestHex(lastOutput) + "\"}");
                break;
            }
        }
    }
}
