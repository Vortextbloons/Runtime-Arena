local script_dir = arg[0]:match("(.*[/\\])") or "./"
local min = math.min
local sort = table.sort
local concat = table.concat
local open = io.open
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local PROTOCOL_VERSION = "2.0.0"

local function arg_value(name)
    for i = 1, #arg do
        if arg[i] == name then return arg[i + 1] end
    end
end

local input_file = arg_value("--input")
local output_file = arg_value("--output")
local protocol_version = arg_value("--protocol-version")
if protocol_version ~= PROTOCOL_VERSION then
    io.stderr:write("unsupported protocol version " .. tostring(protocol_version) .. "\n")
    os.exit(1)
end
if not input_file or not output_file then
    io.stderr:write("Usage: lua main.lua --input <input-file> --output <output-file> --protocol-version 2.0.0\n")
    os.exit(1)
end

local function respond(obj)
    io.write(json.encode(obj), "\n")
    io.flush()
end

local function digest_output(output)
    return sha256(json.encode(output))
end

local f = open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local words = data.words

local function kernel(words)
    local freq = {}
    for i = 1, #words do
        local w = words[i]
        local old = freq[w]
        if old then freq[w] = old + 1 else freq[w] = 1 end
    end
    local entries = {}
    local n = 0
    for w, c in pairs(freq) do
        n = n + 1
        entries[n] = {w, c}
    end
    sort(entries, function(a, b)
        local ca, cb = a[2], b[2]
        if ca ~= cb then return ca > cb end
        return a[1] < b[1]
    end)
    local parts = {}
    for i = 1, n do
        local e = entries[i]
        parts[i] = e[1] .. "," .. e[2] .. "\n"
    end
    local checksum = sha256(concat(parts))
    local top = {}
    local top_count = min(10, n)
    for i = 1, top_count do
        local e = entries[i]
        top[i] = {word = e[1], count = e[2]}
    end
    return {
        benchmark = "word-frequency",
        version = 1,
        totalWords = #words,
        uniqueWords = n,
        topWords = top,
        checksum = checksum,
    }
end

respond({type = "ready", protocolVersion = PROTOCOL_VERSION})
local output
for line in io.stdin:lines() do
    local request = json.decode(line)
    if request.type == "run" then
        output = kernel(words)
        respond({type = "result", requestId = request.requestId, digest = digest_output(output)})
    elseif request.type == "finish" then
        local digest = digest_output(output)
        local out = open(output_file, "w")
        out:write(json.encode(output))
        out:close()
        respond({type = "finish", digest = digest})
        break
    end
end
