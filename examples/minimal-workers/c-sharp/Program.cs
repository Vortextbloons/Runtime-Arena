using System.Text;

ArenaProtocol.RunWorker(args, ArenaProtocol.Arg(args, "--input"), ArenaProtocol.Arg(args, "--output"), () =>
    Encoding.UTF8.GetBytes("{\"benchmark\":\"minimal\",\"version\":1,\"value\":42}"));
