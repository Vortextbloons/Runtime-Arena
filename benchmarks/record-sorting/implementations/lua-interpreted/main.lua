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
local records_input = data.records

local function kernel(recs)
    sort(recs, function(a, b)
        local sa, sb = a.score, b.score
        if sa ~= sb then return sa > sb end
        local ta, tb = a.timestamp, b.timestamp
        if ta ~= tb then return ta < tb end
        return a.id < b.id
    end)
    local n = #recs
    local take = min(n, 10)
    local first = {}
    for j = 1, take do first[j] = recs[j] end
    local last = {}
    local last_start = n - take + 1
    for j = last_start, n do last[#last+1] = recs[j] end
    local parts = {}
    for j = 1, n do
        local r = recs[j]
        parts[j] = r.id .. "," .. r.score .. "," .. r.timestamp .. "\n"
    end
    return {
        benchmark = "record-sorting",
        version = 1,
        recordCount = n,
        firstRecords = first,
        lastRecords = last,
        checksum = sha256(concat(parts))
    }
end

local function copy_records()
    local recs = {}
    for idx = 1, #records_input do
        local src = records_input[idx]
        recs[idx] = {id=src.id, score=src.score, timestamp=src.timestamp}
    end
    return recs
end

respond({type = "ready", protocolVersion = PROTOCOL_VERSION})
local output
for line in io.stdin:lines() do
    local request = json.decode(line)
    if request.type == "run" then
        output = kernel(copy_records())
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
