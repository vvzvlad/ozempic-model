var currentChart = null;
var default_json_data = '{"dosing_schedule":[["2024-08-30","0.25"],["2024-09-01","0.25"],["2024-09-08","0.25"],["2024-09-15","0.25"],["2024-09-22","0.25"],["2024-09-25","0.25"],["2024-09-29","0.25"],["2024-10-05","0.5"],["2024-10-13","0.5"],["2024-10-20","0.25"],["2024-10-24","0.25"],["2024-10-26","0.25"],["2024-10-30","0.25"],["2024-11-02","0.25"],["2024-11-05","0.25"],["2024-11-09","0.25"],["2024-11-12","0.25"],["2024-11-15","0.25"],["2024-11-19","0.25"],["2024-11-22","0.25"],["2024-11-26","0.25"],["2024-11-29","0.25"]],"thresholds":{"from":13,"to":15}}'
var doseOptions = [0, 0.25, 0.5, 1, 2];
var halfLifePeriod = 7;
var absorptionHalfLife = 2; // Half-life for absorption is 2 days (95% absorption in 2 days)
var absorptionRate = 1 - Math.pow(0.05, 1 / absorptionHalfLife); // Calculate daily absorption rate based on half-life
var mg_nmmol_ratio = 16 / 0.8; // Conversion ratio from mg to nmol/L

function createChart(dosing_schedule_data) {
    // Dispose of the existing chart if it exists
    if (currentChart) {
        currentChart.dispose();
        currentChart = null;
    }

    var chart = anychart.line();
    currentChart = chart; // Keep a reference to the current chart

    chart.padding([10, 20, 5, 20]);
    chart.animation(false);
    chart.crosshair(true);
    chart.xAxis().labels().rotation(-80);
    chart.title("Modeling Ozempic Concentration");
    chart.yAxis().title("Concentration (nmol/L)");

    function dailyDecayFactor(halfLifePeriod) {
        return Math.pow(0.5, 1 / halfLifePeriod);
    }

    // Generate an array of dates from the start to the end of the dosing schedule
    function generateDateRange(startDate, endDate) {
        var dates = [];
        var currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            dates.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    }

    var start_date = new Date(dosing_schedule_data[0][0]);
    var end_date = new Date(
        dosing_schedule_data[dosing_schedule_data.length - 1][0]
    );
    end_date.setDate(end_date.getDate() + 7);
    var all_dates = generateDateRange(start_date, end_date);

    // Create a map of dosing schedule for quick lookup
    var dosing_map = {};
    dosing_schedule_data.forEach(function (entry) {
        dosing_map[entry[0]] = parseFloat(entry[1]);
    });

    var body_concentration = 0;
    var depot = 0;
    var body_concentration_data = [];

    all_dates.forEach(function (date) {
        var dateString = date.toISOString().split("T")[0];
        var doseAdded = 0;

        // Calculate absorption from depot (based on calculated absorption rate)
        var absorbedFromDepot = depot * absorptionRate;
        depot -= absorbedFromDepot;
        body_concentration += absorbedFromDepot;

        // Calculate decay (excretion) from body concentration
        body_concentration = body_concentration * dailyDecayFactor(halfLifePeriod);

        // Add dose to depot if present for that day
        if (dosing_map[dateString]) {
            doseAdded = dosing_map[dateString];
            depot += doseAdded;
        }

        // Convert body concentration from mg to nmol/L
        var body_concentration_nmol = body_concentration * mg_nmmol_ratio;

        // Add the calculated concentration to the data array
        body_concentration_data.push([ dateString, body_concentration_nmol.toFixed(2), ]);
    });

    // Calculate moving average for a 14-day window, filling missing values with actual averages based on available data
    var moving_average_data = [];
    var windowSize = 14;
    for (var i = 0; i < body_concentration_data.length; i++) {
        var sum = 0;
        var count = 0;
        for (var j = i - windowSize + 1; j <= i; j++) {
            if (j >= 0) {
                sum += parseFloat(body_concentration_data[j][1]);
                count++;
            }
        }
        var average = (sum / count).toFixed(2);
        moving_average_data.push([body_concentration_data[i][0], average]);
    }

    // setup first series (Body concentration)
    var seriesBodyConcentration = chart.line( anychart.data.set(body_concentration_data).mapAs({ x: 0, value: 1 }) );
    seriesBodyConcentration.name("Body concentration (nmol/L)");
    seriesBodyConcentration.tooltip().enabled(true);

    // setup second series (Dosing schedule)
    var adjusted_dosing_schedule_data = dosing_schedule_data.map(function (
        entry
    ) {
        var correspondingBodyConcentration = body_concentration_data.find(
            function (concentrationEntry) {
                return concentrationEntry[0] === entry[0];
            }
        );
        return [
            entry[0],
            correspondingBodyConcentration ? correspondingBodyConcentration[1] : entry[1],
        ];
    });

    var seriesDosingSchedule = chart.marker( anychart.data.set(adjusted_dosing_schedule_data).mapAs({ x: 0, value: 1 }) );
    seriesDosingSchedule.name("Dosing schedule");
    seriesDosingSchedule.tooltip().enabled(false);
    seriesDosingSchedule.labels().enabled(true).anchor("left-center").padding(10).fontSize(9).rotation(30).format(function () {
            return dosing_map[this.x];
        });

    // setup third series (14-day Moving Average)
    var seriesMovingAverage = chart.line( anychart.data.set(moving_average_data).mapAs({ x: 0, value: 1 }) );
    seriesMovingAverage.name("14-day Moving Average");
    seriesMovingAverage.stroke({ dash: "5 2", thickness: 2, color: "#FF5733", });
    seriesMovingAverage.tooltip().enabled(false);

    var thresholdFrom = parseFloat(document.getElementById("threshold-from").value);
    var thresholdTo = parseFloat(document.getElementById("threshold-to").value);
    chart.rangeMarker().from(thresholdFrom).to(thresholdTo).fill("rgba(0, 255, 0, 0.3)");
    //updatedJson.thresholds = { from: thresholdFrom, to: thresholdTo };

    chart.legend().enabled(true).fontSize(13).padding([0, 0, 20, 0]);
    chart.yScale().ticks().interval(3);
    chart.yScale().minorTicks().interval(1);

    chart.left(20);
    chart.right(20);
    var dateTimeScale = anychart.scales.dateTime();
    dateTimeScale.ticks().interval('day',1);
    chart.xScale(dateTimeScale);

    chart.xGrid({stroke: '#E8E8E8', dash: "3 5"}).xMinorGrid(false)
    chart.yGrid({stroke: '#E8E8E8', dash: "3 5"}).yMinorGrid(false)

    var controller = chart.annotations();
    controller.verticalLine({ xAnchor: new Date().toISOString().split("T")[0], }).allowEdit(false).stroke({color: '#009688', thickness: 2, dash: '5 5', lineCap: 'round'});

    chart.xScroller(true);
    chart.container("chart-container");
    chart.draw();
}


function load_content_from_data(data) {
    var tbody = document.querySelector("#dosing-schedule-table tbody");
    tbody.innerHTML = "";
    dosing_schedule = data.dosing_schedule
    dosing_schedule.forEach(function (entry, index) {
        var row = document.createElement("tr");

        var dateCell = document.createElement("td");
        var dateInput = document.createElement("input");
        dateInput.type = "date";
        dateInput.value = entry[0];
        dateInput.classList.add("date-input");
        dateCell.appendChild(dateInput);
        row.appendChild(dateCell);

        var doseCell = document.createElement("td");
        var doseInputGroup = document.createElement("div");
        doseInputGroup.classList.add("dose-input-group");
        doseOptions.forEach(function (optionValue) {
            var label = document.createElement("label");
            var radio = document.createElement("input");
            radio.type = "radio";
            radio.name = `dose-${index}`;
            radio.value = optionValue;
            if (optionValue == entry[1]) { radio.checked = true; }
            label.appendChild(radio);
            label.appendChild(document.createTextNode(` ${optionValue}`));
            doseInputGroup.appendChild(label);
        });
        doseCell.appendChild(doseInputGroup);
        row.appendChild(doseCell);

        tbody.appendChild(row);
    });
    document.getElementById("threshold-from").value = data.thresholds.from;
    document.getElementById("threshold-to").value = data.thresholds.to;
    createChart(dosing_schedule);
}

function save_content_render_chart() {
    var dosingData = [];
    var rows = document.querySelectorAll("#dosing-schedule-table tbody tr");
    rows.forEach(function (row, index) {
        var date = row.querySelector(".date-input").value;
        var dose = row.querySelector(`input[name='dose-${index}']:checked`).value;
        dosingData.push([date, dose]);
    });
    var thresholdFrom = parseFloat(document.getElementById("threshold-from").value);
    var thresholdTo = parseFloat(document.getElementById("threshold-to").value);
    var updatedJson = { dosing_schedule: dosingData, thresholds: { from: thresholdFrom, to: thresholdTo } };
    document.getElementById("dosing-json").value = JSON.stringify(updatedJson);
    localStorage.setItem("dosingData", JSON.stringify(updatedJson));
    createChart(dosingData);
}


function add_row() {
    var tbody = document.querySelector("#dosing-schedule-table tbody");
    var newRow = document.createElement("tr");

    var dateCell = document.createElement("td");
    var dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.classList.add("date-input");
    var lastRowDateInput = tbody.lastChild.querySelector(".date-input");
    var newDate = new Date(lastRowDateInput.value);
    newDate.setDate(newDate.getDate() + 1);
    dateInput.value = newDate.toISOString().split("T")[0];
    dateCell.appendChild(dateInput);
    newRow.appendChild(dateCell);

    var doseCell = document.createElement("td");
    var doseInputGroup = document.createElement("div");
    doseInputGroup.classList.add("dose-input-group");
    doseOptions.forEach(function (optionValue) {
        var label = document.createElement("label");
        var radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `dose-${tbody.children.length}`;
        radio.value = optionValue;
        if (optionValue === 0) { radio.checked = true; }
        label.appendChild(radio);
        label.appendChild(document.createTextNode(` ${optionValue}`));
        doseInputGroup.appendChild(label);
    });
    doseCell.appendChild(doseInputGroup);
    newRow.appendChild(doseCell);

    tbody.appendChild(newRow);
    save_content_render_chart();
}

function remove_row() {
    var tbody = document.querySelector("#dosing-schedule-table tbody");
    if (tbody.children.length > 0) {
        tbody.removeChild(tbody.lastChild);
        save_content_render_chart();
    }
}

function load_json() {
    var json = document.getElementById("dosing-json").value;
    try {
        var data = JSON.parse(json);
        load_content_from_data(data);
    } catch (e) {        
        alert("Invalid JSON format");
    }
}

anychart.onDocumentReady(function () {
    var local_storage_json = localStorage.getItem("dosingData");
    var data = local_storage_json ? JSON.parse(local_storage_json) : JSON.parse(default_json_data);    
    load_content_from_data(data);
    document.getElementById("dosing-json").value = JSON.stringify(data);

    document.getElementById("load-json-button").addEventListener("click", load_json);
    document.getElementById("add-row-button").addEventListener("click", add_row);
    document.getElementById("remove-row-button").addEventListener("click", remove_row);

    document.querySelector("#dosing-schedule-table").addEventListener("input", save_content_render_chart);
    document.getElementById("threshold-from").addEventListener("input", save_content_render_chart);
    document.getElementById("threshold-to").addEventListener("input", save_content_render_chart);
});


