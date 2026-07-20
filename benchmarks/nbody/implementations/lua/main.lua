local script_dir = arg[0]:match("(.*[/\\])") or "./"
local T={0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045}
local huge = math.huge
local floor = math.floor
local sqrt = math.sqrt
local fmt9 = string.format
local concat = table.concat
local open = io.open

local function ci_width(samples)
    local n = #samples
    if n < 2 then return huge end
    local sum = 0
    for i = 1, n do sum = sum + samples[i] end
    local mean = sum / n
    if mean <= 0 then return huge end
    local var = 0
    for i = 1, n do local d = samples[i] - mean; var = var + d * d end
    var = var / (n - 1)
    local t = T[n + 1] or 2
    return 2 * t * sqrt(var / n) / mean
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

local f = open(input_file, "r"); local data = json.decode(f:read("*a")); f:close()
local steps = data.steps; local delta_time = data.deltaTime; local bodies = data.bodies

local function kernel(b)
local body_count = #b
local dt = delta_time
for step = 1, steps do
    for i = 1, body_count do
        local bi = b[i]; local pix, piy, piz = bi.position[1], bi.position[2], bi.position[3]
        local vix, viy, viz = bi.velocity[1], bi.velocity[2], bi.velocity[3]; local mi = bi.mass
        local bi_pos = bi.position
        local bi_vel = bi.velocity
        for j = i + 1, body_count do
            local bj = b[j]; local mj = bj.mass
            local bj_pos = bj.position
            local bj_vel = bj.velocity
            local dx = bj_pos[1] - pix; local dy = bj_pos[2] - piy; local dz = bj_pos[3] - piz
            local r2 = dx*dx + dy*dy + dz*dz; local m = dt / (r2 * sqrt(r2))
            local dx_mj_m = dx * mj * m; local dy_mj_m = dy * mj * m; local dz_mj_m = dz * mj * m
            local dx_mi_m = dx * mi * m; local dy_mi_m = dy * mi * m; local dz_mi_m = dz * mi * m
            vix = vix + dx_mj_m; viy = viy + dy_mj_m; viz = viz + dz_mj_m
            bj_vel[1] = bj_vel[1] - dx_mi_m; bj_vel[2] = bj_vel[2] - dy_mi_m; bj_vel[3] = bj_vel[3] - dz_mi_m
        end
        bi_vel[1] = vix; bi_vel[2] = viy; bi_vel[3] = viz
    end
    for i = 1, body_count do
        local bi = b[i]; local v = bi.velocity
        local pos = bi.position
        pos[1] = pos[1] + dt * v[1]
        pos[2] = pos[2] + dt * v[2]
        pos[3] = pos[3] + dt * v[3]
    end
end
local energy = 0.0; local pos_parts, vel_parts = {}, {}
local fmt = fmt9
for i = 1, body_count do
    local bi = b[i]; local mass = bi.mass
    local vx, vy, vz = bi.velocity[1], bi.velocity[2], bi.velocity[3]
    local v2 = vx*vx + vy*vy + vz*vz; energy = energy + 0.5 * mass * v2
    local pp = #pos_parts; local vp = #vel_parts
    pos_parts[pp+1] = fmt("%.9f,", bi.position[1])
    pos_parts[pp+2] = fmt("%.9f,", bi.position[2])
    pos_parts[pp+3] = fmt("%.9f,", bi.position[3])
    vel_parts[vp+1] = fmt("%.9f,", vx)
    vel_parts[vp+2] = fmt("%.9f,", vy)
    vel_parts[vp+3] = fmt("%.9f,", vz)
    local pi = bi.position
    for j = i + 1, body_count do
        local bj = b[j]; local bj_pos = bj.position
        local dx = pi[1] - bj_pos[1]; local dy = pi[2] - bj_pos[2]; local dz = pi[3] - bj_pos[3]
        energy = energy - mass * bj.mass / sqrt(dx*dx + dy*dy + dz*dz) end end
return {
    benchmark = "nbody", version = 1, bodyCount = body_count, finalEnergy = energy,
    positionChecksum = sha256(concat(pos_parts)), velocityChecksum = sha256(concat(vel_parts)) }
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
local out = open(output_file, "w"); out:write(json.encode(output)); out:close()
local timing = open(timing_output_file, "w"); timing:write(json.encode({samples=samples})); timing:close()
