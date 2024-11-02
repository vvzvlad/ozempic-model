var chart = null;
var default_json_data = '{ "thresholds":{"from":13,"to":15}, "pharmacokinetics":{"tmax":2,"elimination_halflife":7},  "dosing_schedule":[["2024-08-30","0.25"],["2024-09-01","0.25"],["2024-09-08","0.25"],["2024-09-15","0.25"],["2024-09-22","0.25"],["2024-09-25","0.25"],["2024-09-29","0.25"],["2024-10-05","0.5"],["2024-10-13","0.5"],["2024-10-20","0.25"],["2024-10-24","0.25"],["2024-10-26","0.25"],["2024-10-30","0.25"],["2024-11-02","0.25"],["2024-11-05","0.25"],["2024-11-09","0.25"],["2024-11-12","0.25"],["2024-11-15","0.25"],["2024-11-19","0.25"],["2024-11-22","0.25"],["2024-11-26","0.25"],["2024-11-29","0.25"] ]}'
var doseOptions = [0, 0.25, 0.5, 1, 2];

var mg_nmmol_ratio = 16 / 0.8; // Conversion ratio from mg to nmol/L

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
    save_data_render_chart();
}

function remove_row() {
    var tbody = document.querySelector("#dosing-schedule-table tbody");
    if (tbody.children.length > 0) {
        tbody.removeChild(tbody.lastChild);
        save_data_render_chart();
    }
}

function calculate_concentration_data(data) {
    var tmax_percent = 0.95; // 95% absorption on tmax time
    var absorption_day_rate = 1 - Math.pow(1 - tmax_percent, 1 / data.pharmacokinetics.tmax);
    var elimination_day_rate = Math.pow(0.5, 1 / data.pharmacokinetics.elimination_halflife);

    var dosing_schedule_data = data.dosing_schedule;

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

        // Calculate absorption from depot (based on calculated absorption rate)
        var absorbedFromDepot = depot * absorption_day_rate;
        depot -= absorbedFromDepot;
        body_concentration += absorbedFromDepot;

        // Calculate decay (excretion) from body concentration
        body_concentration = body_concentration * elimination_day_rate;

        // Add dose to depot if present for that day
        if (dosing_map[dateString]) {
            depot += dosing_map[dateString];
        }

        // Convert body concentration from mg to nmol/L
        var body_concentration_nmol = body_concentration * mg_nmmol_ratio;

        // Add the calculated concentration to the data array
        body_concentration_data.push([dateString, body_concentration_nmol.toFixed(2)]);
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

    return {
        body_concentration: body_concentration_data,
        moving_average: moving_average_data,
        dosing_schedule: dosing_schedule_data,
        dosing_map: dosing_map,
    };
}

function render_chart(data) {
    // Dispose of the existing chart if it exists
    if (chart) {
        chart.dispose();
        chart = null;
    }
    chart = anychart.line();

    chart.padding([10, 20, 5, 20]);
    chart.animation(false);
    chart.crosshair(true);
    //chart.title("Modeling Ozempic Concentration");
    chart.xAxis().labels().rotation(-80);
    chart.yAxis().title("Body ozempic concentration (nmol/L)");

    var dosing_map = data.dosing_map;
    console.log(data);

    // setup first series (Body concentration)
    var seriesBodyConcentration = chart.line(anychart.data.set(data.body_concentration).mapAs({ x: 0, value: 1 }));
    seriesBodyConcentration.name("Body concentration");
    seriesBodyConcentration.tooltip().enabled(true);
    seriesBodyConcentration.legendItem().iconType("line");

    // setup second series (Dosing schedule)
    var adjusted_dosing_schedule_data = data.dosing_schedule
        .map(function (entry) {
            var date = entry[0];
            var dose = parseFloat(dosing_map[date]);
            var correspondingBodyConcentration = data.body_concentration.find(
                function (concentrationEntry) { return concentrationEntry[0] === date; }
            );
            var value = correspondingBodyConcentration ? correspondingBodyConcentration[1] : entry[1];

            var doseSizeMap = { 0: 1, 0.25: 3, 0.5: 5, 1: 8, 2: 12 };
            var markerSize = doseSizeMap[parseFloat(dose)] || 5;

            return {
                x: date,
                value: value,
                dose: dose,
                normal: { markerSize: markerSize },
                hovered: { markerSize: markerSize },
                selected: { markerSize: markerSize }
            };
        });

    console.log(adjusted_dosing_schedule_data);
    var dataSet = anychart.data.set(adjusted_dosing_schedule_data);
    var dataMapping = dataSet.mapAs({ x: 'x', value: 'value' });

    var seriesDosingSchedule = chart.marker(dataMapping);
    seriesDosingSchedule.name("Dose");
    seriesDosingSchedule.tooltip().enabled(false);

    seriesDosingSchedule.labels().enabled(true).anchor("left-center").padding(10).fontSize(9)
    seriesDosingSchedule.normal().type("circle")
    seriesDosingSchedule.labels().format(function () { return this.getData('dose').toString(); });
    seriesDosingSchedule.legendItem().iconType("circle");

    // setup third series (14-day Moving Average)
    var seriesMovingAverage = chart.line(anychart.data.set(data.moving_average).mapAs({ x: 0, value: 1 }));
    seriesMovingAverage.name("14-day Moving Average");
    seriesMovingAverage.stroke({ dash: "5 2", thickness: 2, color: "#FF5733" });
    seriesMovingAverage.tooltip().enabled(false);
    seriesMovingAverage.legendItem().iconType("spline");

    var thresholdFrom = parseFloat(document.getElementById("threshold-from").value);
    var thresholdTo = parseFloat(document.getElementById("threshold-to").value);
    chart.rangeMarker().from(thresholdFrom).to(thresholdTo).fill("rgba(0, 255, 0, 0.3)");

    chart.legend().enabled(true).fontSize(13).padding([10, 10, 10, 10]).position("left").align("top").positionMode("inside");

    chart.yScale().ticks().interval(3);
    chart.yScale().minorTicks().interval(1);

    chart.left(20);
    chart.right(20);
    var dateTimeScale = anychart.scales.dateTime();
    dateTimeScale.ticks().interval('day', 1);
    chart.xScale(dateTimeScale);

    chart.xGrid({ stroke: '#E8E8E8', dash: "3 5" }).xMinorGrid(false);
    chart.yGrid({ stroke: '#E8E8E8', dash: "3 5" }).yMinorGrid(false);

    var controller = chart.annotations();
    controller.verticalLine({ xAnchor: new Date().toISOString().split("T")[0] }).allowEdit(false).stroke({ color: '#009688', thickness: 2, dash: '5 5', lineCap: 'round' });

    chart.xScroller(true);
    chart.container("chart-container");
    chart.draw();
}

function save_data_to_html(data) {
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
    if (data.thresholds) {
        document.getElementById("threshold-from").value = data.thresholds.from || 13;
        document.getElementById("threshold-to").value = data.thresholds.to || 15;
    }
    if (data.pharmacokinetics) {
        document.getElementById("tmax").value = data.pharmacokinetics.tmax || 2;
        document.getElementById("elimination_halflife").value = data.pharmacokinetics.elimination_halflife || 7;
    }
}

function get_data_from_html() {
    var dosingData = [];
    var rows = document.querySelectorAll("#dosing-schedule-table tbody tr");
    rows.forEach(function (row, index) {
        var date = row.querySelector(".date-input").value;
        var dose = row.querySelector(`input[name='dose-${index}']:checked`).value;
        dosingData.push([date, dose]);
    });
    var thresholdFrom = parseFloat(document.getElementById("threshold-from").value);
    var thresholdTo = parseFloat(document.getElementById("threshold-to").value);
    var tmax = parseFloat(document.getElementById("tmax").value);
    var elimination_halflife = parseFloat(document.getElementById("elimination_halflife").value);
    var json_data = {
        dosing_schedule: dosingData,
        thresholds: {
            from: thresholdFrom,
            to: thresholdTo
        },
        pharmacokinetics: {
            tmax: tmax,
            elimination_halflife: elimination_halflife,
        },
    };
    return json_data;
}

function save_data_to_local_storage(data) {
    localStorage.setItem("dosingData", JSON.stringify(data));
}

function save_data_to_json(data) {
    document.getElementById("dosing-json").value = JSON.stringify(data);
}

function save_data_render_chart() {
    var data = get_data_from_html();
    var chart_data = calculate_concentration_data(data);
    save_data_to_local_storage(data);
    save_data_to_json(data);
    render_chart(chart_data);
}

function from_json_to_html() {
    var html_json = document.getElementById("dosing-json").value;
    try {
        var data = JSON.parse(html_json);
        save_data_to_html(data);
        save_data_render_chart();
    } catch (e) {
        alert("Invalid JSON format");
    }
}

function load_data_from_local_storage() {
    var local_storage_json = localStorage.getItem("dosingData");
    var data = local_storage_json ? JSON.parse(local_storage_json) : JSON.parse(default_json_data);
    return data;
}

anychart.onDocumentReady(function () {
    data = load_data_from_local_storage();
    save_data_to_html(data);
    save_data_to_json(data);
    var chart_data = calculate_concentration_data(data);
    render_chart(chart_data);

    document.getElementById("load-json-button").addEventListener("click", from_json_to_html);
    document.getElementById("add-row-button").addEventListener("click", add_row);
    document.getElementById("remove-row-button").addEventListener("click", remove_row);

    document.querySelector("#dosing-schedule-table").addEventListener("input", save_data_render_chart);
    document.getElementById("threshold-from").addEventListener("input", save_data_render_chart);
    document.getElementById("threshold-to").addEventListener("input", save_data_render_chart);
    document.getElementById("tmax").addEventListener("input", save_data_render_chart);
    document.getElementById("elimination_halflife").addEventListener("input", save_data_render_chart);
});
