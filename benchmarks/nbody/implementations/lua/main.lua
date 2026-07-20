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

local function copy_bodies()
    local b = {}
    for idx = 1, #bodies do
        local src = bodies[idx]
        b[idx] = {mass=src.mass, position={src.position[1], src.position[2], src.position[3]},
            velocity={src.velocity[1], src.velocity[2], src.velocity[3]}}
    end
    return b
end

respond({type = "ready", protocolVersion = PROTOCOL_VERSION})
local output
for line in io.stdin:lines() do
    local request = json.decode(line)
    if request.type == "run" then
        output = kernel(copy_bodies())
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
