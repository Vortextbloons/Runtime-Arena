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
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file>\n"); os.exit(1) end

local f = io.open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local steps = data.steps; local delta_time = data.deltaTime; local bodies = data.bodies

local function kernel(b)
local body_count = #b
local dt = delta_time
for step = 1, steps do
    for i = 1, body_count do
        local bi = b[i]; local pix, piy, piz = bi.position[1], bi.position[2], bi.position[3]
        local vix, viy, viz = bi.velocity[1], bi.velocity[2], bi.velocity[3]; local mi = bi.mass
        for j = i + 1, body_count do
            local bj = b[j]; local mj = bj.mass
            local dx = bj.position[1] - pix; local dy = bj.position[2] - piy; local dz = bj.position[3] - piz
            local r2 = dx*dx + dy*dy + dz*dz; local m = dt / (r2 * math.sqrt(r2))
            local mix = dx * mj * m; local miy = dy * mj * m; local miz = dz * mj * m
            local mjx = dx * mi * m; local mjy = dy * mi * m; local mjz = dz * mi * m
            vix = vix + mix; viy = viy + miy; viz = viz + miz
            bj.velocity[1] = bj.velocity[1] - mjx; bj.velocity[2] = bj.velocity[2] - mjy; bj.velocity[3] = bj.velocity[3] - mjz
        end
        bi.velocity[1] = vix; bi.velocity[2] = viy; bi.velocity[3] = viz
    end
    for i = 1, body_count do
        local bi = b[i]; local v = bi.velocity
        bi.position[1] = bi.position[1] + dt * v[1]
        bi.position[2] = bi.position[2] + dt * v[2]
        bi.position[3] = bi.position[3] + dt * v[3]
    end
end
local energy = 0.0; local pos_parts, vel_parts = {}, {}
for i = 1, body_count do
    local bi = b[i]; local mass = bi.mass
    local v2 = bi.velocity[1]*bi.velocity[1] + bi.velocity[2]*bi.velocity[2] + bi.velocity[3]*bi.velocity[3]; energy = energy + 0.5 * mass * v2
    for k = 1, 3 do
        pos_parts[#pos_parts+1] = string.format("%.9f,", bi.position[k])
        vel_parts[#vel_parts+1] = string.format("%.9f,", bi.velocity[k]) end
    for j = i + 1, body_count do
        local bj = b[j]; local dx = bi.position[1] - bj.position[1]; local dy = bi.position[2] - bj.position[2]; local dz = bi.position[3] - bj.position[3]
        energy = energy - mass * bj.mass / math.sqrt(dx*dx + dy*dy + dz*dz) end end
return {
    benchmark = "nbody", version = 1, bodyCount = body_count, finalEnergy = energy,
    positionChecksum = sha256(table.concat(pos_parts)), velocityChecksum = sha256(table.concat(vel_parts)) }
end

local samples = {}; local sn = 0; local output
local kernel_times = {}
for iteration = -warmups, math.huge do
    local b = {}
    for idx = 1, #bodies do
        local src = bodies[idx]
        b[idx] = {mass=src.mass, position={src.position[1], src.position[2], src.position[3]},
            velocity={src.velocity[1], src.velocity[2], src.velocity[3]}} end
    local started = now_ns(); output = kernel(b)
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then
        kernel_times[#kernel_times + 1] = elapsed
        sn = sn + 1
        samples[sn] = {iteration=sn, kernelTimeNanoseconds=elapsed}
        if #kernel_times >= max_iterations or (#kernel_times >= min_iterations and ci_width(kernel_times) <= target_ci) then break end
    end end
local out = io.open(output_file, "w"); out:write(json.encode(output)); out:close()
local timing = io.open(timing_output_file, "w"); timing:write(json.encode({samples=samples})); timing:close()
