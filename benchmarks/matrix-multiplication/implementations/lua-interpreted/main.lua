local script_dir = arg[0]:match("(.*[/\\])") or "./"
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
local n = data.dimension
local a = data.left
local b = data.right

local function kernel()
    local c = {}
    local value_sum = 0
    local diagonal_sum = 0
    local nn = n * n
    for idx = 1, nn do c[idx] = 0 end
    for i = 0, n - 1 do
        local row_off = i * n
        local ai1 = row_off + 1
        for j = 0, n - 1 do
            c[row_off + j + 1] = 0
        end
        for k = 0, n - 1 do
            local a_ik = a[ai1 + k]
            local bk_off = k * n
            for j = 0, n - 1 do
                c[row_off + j + 1] = c[row_off + j + 1] + a_ik * b[bk_off + j + 1]
            end
        end
        for j = 0, n - 1 do
            local s = c[row_off + j + 1]
            value_sum = value_sum + s
            if i == j then diagonal_sum = diagonal_sum + s end
        end
    end
    local parts = {"dimension=" .. n .. "\n"}
    for idx = 1, nn do
        parts[idx + 1] = c[idx] .. ","
    end
    parts[nn + 2] = "\n"
    local checksum = sha256(concat(parts))
    return {
        benchmark = "matrix-multiplication", version = 1, dimension = n, elementCount = nn,
        valueSum = value_sum, diagonalSum = diagonal_sum, checksum = checksum }
end

respond({type = "ready", protocolVersion = PROTOCOL_VERSION})
local output
for line in io.stdin:lines() do
    local request = json.decode(line)
    if request.type == "run" then
        output = kernel()
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
