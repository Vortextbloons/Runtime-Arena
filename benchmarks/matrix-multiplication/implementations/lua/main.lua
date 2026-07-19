local script_dir = arg[0]:match("(.*[/\\])") or "./"
local T={0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045}
local function ci_width(samples)
    local n = #samples
    if n < 2 then return math.huge end
    local sum = 0
    for i = 1, n do sum = sum + samples[i] end
    local mean = sum / n
    if mean <= 0 then return math.huge end
    local var = 0
    for i = 1, n do local d = samples[i] - mean; var = var + d * d end
    var = var / (n - 1)
    local t = T[n + 1] or 2
    return 2 * t * math.sqrt(var / n) / mean
end
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local ffi = require("ffi")
ffi.cdef[[typedef long long LARGE_INTEGER; int QueryPerformanceCounter(LARGE_INTEGER*); int QueryPerformanceFrequency(LARGE_INTEGER*);]]
local counter, frequency = ffi.new("LARGE_INTEGER[1]"), ffi.new("LARGE_INTEGER[1]")
ffi.C.QueryPerformanceFrequency(frequency)
local function now_ns() ffi.C.QueryPerformanceCounter(counter); return tonumber(counter[0]) * 1000000000 / tonumber(frequency[0]) end

local input_file, output_file, timing_output_file
local warmups, min_iterations, max_iterations, target_ci = 0, 1, 1, 0.05
local i = 1
while i <= #arg do
    local a = arg[i]
    if a == "--input" then input_file = arg[i+1]; i = i+2
    elseif a == "--output" then output_file = arg[i+1]; i = i+2
    elseif a == "--timing-output" then timing_output_file = arg[i+1]; i = i+2
    elseif a == "--warmup" then warmups = tonumber(arg[i+1]); i = i+2
    elseif a == "--min-iterations" then min_iterations = tonumber(arg[i+1]); i = i+2
    elseif a == "--max-iterations" then max_iterations = tonumber(arg[i+1]); i = i+2
    elseif a == "--target-relative-ci" then target_ci = tonumber(arg[i+1]); i = i+2
    else i = i+1 end
end
if not input_file or not output_file or not timing_output_file then
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file> --timing-output <timing-file>\n"); os.exit(1) end

local f = io.open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local n = data.dimension
local a = data.left
local b = data.right

local function kernel()
    local c = {}
    local value_sum = 0
    local diagonal_sum = 0
    for i = 0, n - 1 do
        for j = 0, n - 1 do
            local s = 0
            for k = 0, n - 1 do
                s = s + a[i * n + k + 1] * b[k * n + j + 1]
            end
            c[i * n + j + 1] = s
            value_sum = value_sum + s
            if i == j then diagonal_sum = diagonal_sum + s end
        end
    end
    local parts = {"dimension=" .. n .. "\n"}
    for idx = 1, n * n do
        parts[#parts + 1] = c[idx] .. ","
    end
    parts[#parts + 1] = "\n"
    local checksum = sha256(table.concat(parts))
    return {
        benchmark = "matrix-multiplication", version = 1, dimension = n, elementCount = n * n,
        valueSum = value_sum, diagonalSum = diagonal_sum, checksum = checksum }
end

local samples = {}; local sn = 0; local output
local kernel_times = {}
for iteration = -warmups, math.huge do
    local started = now_ns(); output = kernel()
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then
        kernel_times[#kernel_times + 1] = elapsed
        sn = sn + 1
        samples[sn] = {iteration=sn, kernelTimeNanoseconds=elapsed}
        if #kernel_times >= max_iterations or (#kernel_times >= min_iterations and ci_width(kernel_times) <= target_ci) then break end
    end
end
local out = io.open(output_file, "w"); out:write(json.encode(output)); out:close()
local timing = io.open(timing_output_file, "w"); timing:write(json.encode({samples=samples})); timing:close()
