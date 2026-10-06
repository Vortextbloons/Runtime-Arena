local script_dir = arg[0]:match("(.*[/\\])") or "./"
local floor = math.floor
local sqrt = math.sqrt
local fmt9 = string.format
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
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file> --protocol-version 2.0.0\n")
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
local steps = data.steps; local delta_time = data.deltaTime; local bodies = data.bodies

local function kernel(mass, px, py, pz, vx, vy, vz)
local body_count = #mass
local dt = delta_time
for step = 1, steps do
    for i = 1, body_count do
        local pxi, pyi, pzi = px[i], py[i], pz[i]
        local vix, viy, viz = vx[i], vy[i], vz[i]
        local mi = mass[i]
        for j = i + 1, body_count do
            local mj = mass[j]
            local dx = px[j] - pxi; local dy = py[j] - pyi; local dz = pz[j] - pzi
            local r2 = dx*dx + dy*dy + dz*dz; local m = dt / (r2 * sqrt(r2))
            vix = vix + dx * mj * m; viy = viy + dy * mj * m; viz = viz + dz * mj * m
            vx[j] = vx[j] - dx * mi * m; vy[j] = vy[j] - dy * mi * m; vz[j] = vz[j] - dz * mi * m
        end
        vx[i] = vix; vy[i] = viy; vz[i] = viz
    end
    for i = 1, body_count do
        px[i] = px[i] + dt * vx[i]
        py[i] = py[i] + dt * vy[i]
        pz[i] = pz[i] + dt * vz[i]
    end
end
local energy = 0.0; local pos_parts, vel_parts = {}, {}
local fmt = fmt9
for i = 1, body_count do
    local mi = mass[i]
    local vxi, vyi, vzi = vx[i], vy[i], vz[i]
    local pxi, pyi, pzi = px[i], py[i], pz[i]
    energy = energy + 0.5 * mi * (vxi*vxi + vyi*vyi + vzi*vzi)
    local pp = #pos_parts; local vp = #vel_parts
    pos_parts[pp+1] = fmt("%.9f,", pxi)
    pos_parts[pp+2] = fmt("%.9f,", pyi)
    pos_parts[pp+3] = fmt("%.9f,", pzi)
    vel_parts[vp+1] = fmt("%.9f,", vxi)
    vel_parts[vp+2] = fmt("%.9f,", vyi)
    vel_parts[vp+3] = fmt("%.9f,", vzi)
    for j = i + 1, body_count do
        local dx = pxi - px[j]; local dy = pyi - py[j]; local dz = pzi - pz[j]
        energy = energy - mi * mass[j] / sqrt(dx*dx + dy*dy + dz*dz) end end
return {
    benchmark = "nbody", version = 1, bodyCount = body_count, finalEnergy = energy,
    positionChecksum = sha256(concat(pos_parts)), velocityChecksum = sha256(concat(vel_parts)) }
end

local function build_state()
    local mass, px, py, pz, vx, vy, vz = {}, {}, {}, {}, {}, {}, {}
    for idx = 1, #bodies do
        local src = bodies[idx]
        mass[idx] = src.mass
        px[idx], py[idx], pz[idx] = src.position[1], src.position[2], src.position[3]
        vx[idx], vy[idx], vz[idx] = src.velocity[1], src.velocity[2], src.velocity[3]
    end
    return mass, px, py, pz, vx, vy, vz
end

respond({type = "ready", protocolVersion = PROTOCOL_VERSION})
local output
for line in io.stdin:lines() do
    local request = json.decode(line)
    if request.type == "run" then
        output = kernel(build_state())
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
