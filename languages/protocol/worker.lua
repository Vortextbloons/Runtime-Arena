local ArenaProtocol = {}

ArenaProtocol.VERSION = "2.0.0"

local function digest_bytes(data)
  local digest = require("sha256").hash(data)
  return digest
end

function ArenaProtocol.arg(name)
  for index = 1, #arg - 1 do
    if arg[index] == name then return arg[index + 1] end
  end
  error("missing " .. name)
end

function ArenaProtocol.emit_line(value)
  if type(value) == "table" then
    local json = require("json")
    io.write(json.encode(value), "\n")
  else
    io.write(value, "\n")
  end
  io.stdout:flush()
end

function ArenaProtocol.protocol_field(line, field)
  local key = '"' .. field .. '":'
  local start = line:find(key, 1, true)
  if not start then return "" end
  start = start + #key
  while line:sub(start, start) == " " do start = start + 1 end
  if line:sub(start, start) == '"' then
    local close = line:find('"', start + 1, true)
    return line:sub(start + 1, close - 1)
  end
  local finish = start
  while finish <= #line and not line:sub(finish, finish):match("[,} ]") do finish = finish + 1 end
  return line:sub(start, finish - 1)
end

function ArenaProtocol.run_worker(input_path, output_path, kernel)
  if ArenaProtocol.arg("--protocol-version") ~= ArenaProtocol.VERSION then
    error("unsupported protocol version")
  end
  local input = io.open(input_path, "r")
  input:read("*a")
  input:close()

  ArenaProtocol.emit_line({ type = "ready", protocolVersion = ArenaProtocol.VERSION })

  local json = require("json")
  local last_output = ""
  for line in io.lines() do
    if line == "" then goto continue end
    local message = json.decode(line)
    if message.type == "run" then
      last_output = json.encode(kernel())
      ArenaProtocol.emit_line({
        type = "result",
        requestId = message.requestId,
        digest = digest_bytes(last_output)
      })
    elseif message.type == "finish" then
      local output = io.open(output_path, "w")
      output:write(last_output)
      output:close()
      ArenaProtocol.emit_line({ type = "finish", digest = digest_bytes(last_output) })
      break
    end
    ::continue::
  end
end

return ArenaProtocol
