local script_dir = arg[0]:match("(.*[/\\])") or "./"
local T={0,12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.201,2.179,2.16,2.145,2.131,2.12,2.11,2.101,2.093,2.086,2.08,2.074,2.069,2.064,2.06,2.056,2.052,2.048,2.045}
local huge = math.huge
local min = math.min
local floor = math.floor
local sort = table.sort
local concat = table.concat
local insert = table.insert
local format = string.format
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
    return 2 * t * (var / n)^0.5 / mean
end
package.path = script_dir .. "?.lua;" .. package.path

local json = require("json")
local sha256 = require("sha256")
local os_clock = os.clock
local function now_ns()
    return os_clock() * 1e9
end

local input_file = nil
local output_file = nil
local timing_output_file = nil
local warmups = 0
local min_iterations = 1
local max_iterations = 1
local target_ci = 0.05

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
    elseif arg[i] == "--min-iterations" then
        min_iterations = tonumber(arg[i + 1])
        i = i + 2
    elseif arg[i] == "--max-iterations" then
        max_iterations = tonumber(arg[i + 1])
        i = i + 2
    elseif arg[i] == "--target-relative-ci" then
        target_ci = tonumber(arg[i + 1])
        i = i + 2
    else
        i = i + 1
    end
end

if not input_file or not output_file or not timing_output_file then
    io.stderr:write("Usage: lua main.lua --input <input-file> --output <output-file>\n")
    os.exit(1)
end

local f = open(input_file, "r")
local content = f:read("*a")
f:close()

local rows = {}
local first_line = true
for line in content:gmatch("[^\r\n]+") do
    if first_line then first_line = false else
        local fields = {}
        for field in line:gmatch("[^,]+") do fields[#fields+1] = field end
        if #fields >= 5 then rows[#rows+1] = {fields[2],fields[3],tonumber(fields[4]),tonumber(fields[5])} end
    end
end

local function kernel()
local record_count = 0
local total_quantity = 0
local total_value_minor_units = 0
local minimum_transaction = huge
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
sort(sorted_categories, function(a, b) return a.category < b.category end)

local sorted_accounts = {}
local sa_n = 0
for acc_id, value in pairs(accounts) do
    sa_n = sa_n + 1
    sorted_accounts[sa_n] = {accountId = acc_id, valueMinorUnits = value}
end
sort(sorted_accounts, function(a, b)
    if a.valueMinorUnits ~= b.valueMinorUnits then
        return a.valueMinorUnits > b.valueMinorUnits
    end
    return a.accountId < b.accountId
end)

local top_accounts = {}
local top_n = min(10, #sorted_accounts)
for idx = 1, top_n do
    top_accounts[idx] = sorted_accounts[idx]
end

local cats_json = {}
for ci = 1, sc_n do
    local cat = sorted_categories[ci]
    cats_json[ci] = format('{"category":"%s","quantity":%d,"valueMinorUnits":%d}',
        cat.category, cat.quantity, cat.valueMinorUnits)
end

local accs_json = {}
for ai = 1, top_n do
    local acc = top_accounts[ai]
    accs_json[ai] = format('{"accountId":"%s","valueMinorUnits":%d}',
        acc.accountId, acc.valueMinorUnits)
end

local checksum_input = '{"Categories":[' .. concat(cats_json, ",") ..
    '],"TopAccounts":[' .. concat(accs_json, ",") .. ']}\n'

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
local kernel_times = {}
for iteration = -warmups, math.huge do
    local started = now_ns()
    output = kernel()
    local elapsed = math.max(1, math.floor(now_ns() - started + 0.5))
    if iteration >= 0 then
        kernel_times[#kernel_times + 1] = elapsed
        sn = sn + 1
        samples[sn] = {iteration=sn, kernelTimeNanoseconds=elapsed}
        if #kernel_times >= max_iterations or (#kernel_times >= min_iterations and ci_width(kernel_times) <= target_ci) then break end
    end
end

local out = open(output_file, "w")
out:write(json.encode(output))
out:close()
local timing = open(timing_output_file, "w")
timing:write(json.encode({samples=samples}))
timing:close()
