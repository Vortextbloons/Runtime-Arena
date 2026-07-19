local script_dir = arg[0]:match("(.*[/\\])") or "./"
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local ffi = require("ffi")
ffi.cdef[[typedef long long LARGE_INTEGER; int QueryPerformanceCounter(LARGE_INTEGER*); int QueryPerformanceFrequency(LARGE_INTEGER*);]]
local counter, frequency = ffi.new("LARGE_INTEGER[1]"), ffi.new("LARGE_INTEGER[1]")
ffi.C.QueryPerformanceFrequency(frequency)
local function now_ns() ffi.C.QueryPerformanceCounter(counter); return tonumber(counter[0]) * 1000000000 / tonumber(frequency[0]) end

local input_file = nil
local output_file = nil
local timing_output_file = nil
local warmups = 0
local iterations = 1

local i = 1
while i <= #arg do
    if arg[i] == "--input" then
        input_file = arg[i + 1]
        i = i + 2
    elseif arg[i] == "--output" then
        output_file = arg[i + 1]
        i = i + 2
    elseif arg[i] == "--timing-output" then
        timing_output_file = arg[i + 1]
        i = i + 2
    elseif arg[i] == "--warmup" then
        warmups = tonumber(arg[i + 1])
        i = i + 2
    elseif arg[i] == "--iterations" then
        iterations = tonumber(arg[i + 1])
        i = i + 2
    else
        i = i + 1
    end
end

if not input_file or not output_file or not timing_output_file then
    io.stderr:write("Usage: luajit main.lua --input <input-file> --output <output-file>\n")
    os.exit(1)
end

local f = io.open(input_file, "r")
local content = f:read("*a")
f:close()

local rows = {}
local first_line = true
for line in content:gmatch("[^\r\n]+") do
    if first_line then first_line = false else
        local fields = {}
        for field in line:gmatch("[^,]+") do table.insert(fields, field) end
        if #fields >= 5 then table.insert(rows, {fields[2],fields[3],tonumber(fields[4]),tonumber(fields[5])}) end
    end
end

local function kernel()
local record_count = 0
local total_quantity = 0
local total_value_minor_units = 0
local minimum_transaction = math.huge
local maximum_transaction = 0

local categories = {}
local accounts = {}

local row_count = #rows
for ri = 1, row_count do
            local fields = rows[ri]
            local account_id = fields[1]
            local category = fields[2]
            local quantity = fields[3]
            local unit_price = fields[4]
            local value = quantity * unit_price

            record_count = record_count + 1
            total_quantity = total_quantity + quantity
            total_value_minor_units = total_value_minor_units + value
            if value < minimum_transaction then minimum_transaction = value end
            if value > maximum_transaction then maximum_transaction = value end

            local cat = categories[category]
            if not cat then
                cat = {quantity = 0, valueMinorUnits = 0}
                categories[category] = cat
            end
            cat.quantity = cat.quantity + quantity
            cat.valueMinorUnits = cat.valueMinorUnits + value

            local acc = accounts[account_id]
            if not acc then
                accounts[account_id] = value
            else
                accounts[account_id] = acc + value
            end
end

local sorted_categories = {}
local sc_n = 0
for cat, data in pairs(categories) do
    sc_n = sc_n + 1
    sorted_categories[sc_n] = {
        category = cat,
        quantity = data.quantity,
        valueMinorUnits = data.valueMinorUnits
    }
end
table.sort(sorted_categories, function(a, b) return a.category < b.category end)

local sorted_accounts = {}
local sa_n = 0
for acc_id, value in pairs(accounts) do
    sa_n = sa_n + 1
    sorted_accounts[sa_n] = {accountId = acc_id, valueMinorUnits = value}
end
table.sort(sorted_accounts, function(a, b)
    if a.valueMinorUnits ~= b.valueMinorUnits then
        return a.valueMinorUnits > b.valueMinorUnits
    end
    return a.accountId < b.accountId
end)

local top_accounts = {}
local top_n = math.min(10, #sorted_accounts)
for idx = 1, top_n do
    top_accounts[idx] = sorted_accounts[idx]
end

local function encode_category(cat)
    return string.format('{"category":"%s","quantity":%d,"valueMinorUnits":%d}',
        cat.category, cat.quantity, cat.valueMinorUnits)
end

local function encode_account(acc)
    return string.format('{"accountId":"%s","valueMinorUnits":%d}',
        acc.accountId, acc.valueMinorUnits)
end

local cats_json = {}
local cj_n = 0
for ci = 1, sc_n do
    cj_n = cj_n + 1
    cats_json[cj_n] = encode_category(sorted_categories[ci])
end

local accs_json = {}
local aj_n = 0
for ai = 1, top_n do
    aj_n = aj_n + 1
    accs_json[aj_n] = encode_account(top_accounts[ai])
end

local checksum_input = '{"Categories":[' .. table.concat(cats_json, ",") ..
    '],"TopAccounts":[' .. table.concat(accs_json, ",") .. ']}\n'

local checksum = sha256(checksum_input)

return {
    benchmark = "aggregation",
    version = 1,
    recordCount = record_count,
    totalQuantity = total_quantity,
    totalValueMinorUnits = total_value_minor_units,
    categories = sorted_categories,
    topAccounts = top_accounts,
    minimumTransactionMinorUnits = minimum_transaction,
    maximumTransactionMinorUnits = maximum_transaction,
    checksum = checksum
}
end

local samples = {}; local sn = 0
local output
for iteration = -warmups, iterations - 1 do
    local started = now_ns()
    output = kernel()
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then sn = sn + 1; samples[sn] = {iteration=iteration + 1,kernelTimeNanoseconds=elapsed} end
end

local out = io.open(output_file, "w")
out:write(json.encode(output))
out:close()
local timing = io.open(timing_output_file, "w")
timing:write(json.encode({samples=samples}))
timing:close()
