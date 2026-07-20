public final class Main {
    public static void main(String[] args) throws Exception {
        ArenaProtocol.runWorker(args, ArenaProtocol.arg(args, "--input"), ArenaProtocol.arg(args, "--output"),
            () -> "{\"benchmark\":\"minimal\",\"version\":1,\"value\":42}".getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
