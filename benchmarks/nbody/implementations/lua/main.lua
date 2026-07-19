local script_dir = arg[0]:match("(.*[/\\])") or "./"
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local ffi = require("ffi")
ffi.cdef[[typedef long long LARGE_INTEGER; int QueryPerformanceCounter(LARGE_INTEGER*); int QueryPerformanceFrequency(LARGE_INTEGER*);]]
local counter, frequency = ffi.new("LARGE_INTEGER[1]"), ffi.new("LARGE_INTEGER[1]")
ffi.C.QueryPerformanceFrequency(frequency)
local function now_ns() ffi.C.QueryPerformanceCounter(counter); return tonumber(counter[0]) * 1000000000 / tonumber(frequency[0]) end

local input_file, output_file, timing_output_file
local warmups, iterations = 0, 1
local i = 1
while i <= #arg do
    local a = arg[i]
    if a == "--input" then input_file = arg[i+1]; i = i+2
    elseif a == "--output" then output_file = arg[i+1]; i = i+2
    elseif a == "--timing-output" then timing_output_file = arg[i+1]; i = i+2
    elseif a == "--warmup" then warmups = tonumber(arg[i+1]); i = i+2
    elseif a == "--iterations" then iterations = tonumber(arg[i+1]); i = i+2
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
for iteration = -warmups, iterations - 1 do
    local b = {}
    for idx = 1, #bodies do
        local src = bodies[idx]
        b[idx] = {mass=src.mass, position={src.position[1], src.position[2], src.position[3]},
            velocity={src.velocity[1], src.velocity[2], src.velocity[3]}} end
    local started = now_ns(); output = kernel(b)
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then sn = sn + 1; samples[sn] = {iteration=iteration+1, kernelTimeNanoseconds=elapsed} end end
local out = io.open(output_file, "w"); out:write(json.encode(output)); out:close()
local timing = io.open(timing_output_file, "w"); timing:write(json.encode({samples=samples})); timing:close()
