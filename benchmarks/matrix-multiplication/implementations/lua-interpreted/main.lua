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
    local nn = n * n
    -- Transpose B once so the cubic loop streams both operands sequentially.
    local bt = {}
    for i = 0, n - 1 do
        local rbase = i * n
        for j = 0, n - 1 do
            bt[j * n + i + 1] = b[rbase + j + 1]
        end
    end
    -- Row/row dot products with 2-way unrolled accumulator parallelism.
    local c = {}
    local value_sum = 0
    local diagonal_sum = 0
    local kLim = n - (n % 4)
    for i = 0, n - 1 do
        local abase = i * n
        local cbase = i * n
        local row_sum = 0
        for j = 0, n - 1 do
            local bbase = j * n
            local s0, s1, s2, s3 = 0, 0, 0, 0
            for k = 0, kLim - 1, 4 do
                s0 = s0 + a[abase + k + 1] * bt[bbase + k + 1]
                s1 = s1 + a[abase + k + 2] * bt[bbase + k + 2]
                s2 = s2 + a[abase + k + 3] * bt[bbase + k + 3]
                s3 = s3 + a[abase + k + 4] * bt[bbase + k + 4]
            end
            local s = (s0 + s1) + (s2 + s3)
            for k = kLim, n - 1 do
                s = s + a[abase + k + 1] * bt[bbase + k + 1]
            end
            c[cbase + j + 1] = s
            row_sum = row_sum + s
            if i == j then diagonal_sum = diagonal_sum + s end
        end
        value_sum = value_sum + row_sum
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
