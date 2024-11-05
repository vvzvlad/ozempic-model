var chart = null;
var default_json_data = '{ "thresholds":{"from":13,"to":15}, "pharmacokinetics":{"tmax":2,"elimination_halflife":7}, "satiety":[["2024-08-30","4"], ["2024-08-28","4"]],  "dosing_schedule":[["2024-08-30","0.25"],["2024-09-01","0.25"],["2024-09-08","0.25"],["2024-09-15","0.25"],["2024-09-22","0.25"],["2024-09-25","0.25"],["2024-09-29","0.25"],["2024-10-05","0.5"],["2024-10-13","0.5"],["2024-10-20","0.25"],["2024-10-24","0.25"],["2024-10-26","0.25"],["2024-10-30","0.25"],["2024-11-02","0.25"],["2024-11-05","0.25"],["2024-11-09","0.25"],["2024-11-12","0.25"],["2024-11-15","0.25"],["2024-11-19","0.25"],["2024-11-22","0.25"],["2024-11-26","0.25"],["2024-11-29","0.25"] ]}'
var dose_options = [0, 0.25, 0.5, 1, 2];

var mg_nmmol_ratio = 16 / 0.8; // Conversion ratio from mg to nmol/L

function add_row_dosing() {
    var tbody = document.querySelector("#dosing-schedule-table tbody");
    var new_row = document.createElement("tr");

    var date_cell = document.createElement("td");
    var date_input = document.createElement("input");
    date_input.type = "date";
    date_input.classList.add("date-input");
    var last_row_date_input = tbody.lastChild.querySelector(".date-input");
    var new_date = new Date(last_row_date_input.value);
    new_date.setDate(new_date.getDate() + 1);
    date_input.value = new_date.toISOString().split("T")[0];
    date_cell.appendChild(date_input);
    new_row.appendChild(date_cell);

    var dose_cell = document.createElement("td");
    var dose_input_group = document.createElement("div");
    dose_input_group.classList.add("dose-input-group");
    dose_options.forEach(function (option_value) {
        var label = document.createElement("label");
        var radio = document.createElement("input");
        radio.type = "radio";
        radio.name = `dose-${tbody.children.length}`;
        radio.value = option_value;
        if (option_value === 0) { radio.checked = true; }
        label.appendChild(radio);
        label.appendChild(document.createTextNode(` ${option_value}`));
        dose_input_group.appendChild(label);
    });
    dose_cell.appendChild(dose_input_group);
    new_row.appendChild(dose_cell);

    tbody.appendChild(new_row);
    save_data_render_chart();
}

function remove_row_dosing() {
    var tbody = document.querySelector("#dosing-schedule-table tbody");
    if (tbody.children.length > 0) {
        tbody.removeChild(tbody.lastChild);
        save_data_render_chart();
    }
}

function add_row_satiety() {
    var tbody = document.querySelector("#satiety-table tbody");
    var new_row = document.createElement("tr");

    var date_cell = document.createElement("td");
    var date_input = document.createElement("input");
    date_input.type = "date";
    date_input.classList.add("date-input");
    var last_row_date_input = tbody.lastChild.querySelector(".date-input");
    var new_date = new Date(last_row_date_input.value);
    new_date.setDate(new_date.getDate() + 1);
    date_input.value = new_date.toISOString().split("T")[0];
    date_cell.appendChild(date_input);
    new_row.appendChild(date_cell);

    var satiety_cell = document.createElement("td");
    var satiety_input = document.createElement("input");
    satiety_input.type = "number";
    satiety_input.step = 0.5;
    satiety_input.value = 5;
    satiety_input.max = 9;
    satiety_input.min = 0;
    satiety_cell.appendChild(satiety_input);
    new_row.appendChild(satiety_cell);

    tbody.appendChild(new_row);
}

function remove_row_satiety() {
    var tbody = document.querySelector("#satiety-table tbody");
    if (tbody.children.length > 0) {
        tbody.removeChild(tbody.lastChild);
    }
}


// Generate an array of dates from the start to the end of the dosing schedule
function generate_date_range(start_date, end_date) {
    var dates = [];
    var current_date = new Date(start_date);
    while (current_date <= end_date) {
        dates.push(new Date(current_date));
        current_date.setDate(current_date.getDate() + 1);
    }
    return dates;
}


function calculate_concentration_data(data) {
    var tmax_percent = 0.95; // 95% absorption on tmax time
    var absorption_day_rate = 1 - Math.pow(1 - tmax_percent, 1 / data.pharmacokinetics.tmax);
    var elimination_day_rate = Math.pow(0.5, 1 / data.pharmacokinetics.elimination_halflife);

    var satiety_data = data.satiety;
    var dosing_schedule_data = data.dosing_schedule;

    var start_date = new Date(dosing_schedule_data[0][0]);
    var end_date = new Date( dosing_schedule_data[dosing_schedule_data.length - 1][0] );
    end_date.setDate(end_date.getDate() + 7);
    var all_dates = generate_date_range(start_date, end_date);

    var body_concentration = 0;
    var depot = 0;
    var body_concentration_data = [];

    all_dates.forEach(function (date) {
        var date_string = date.toISOString().split("T")[0];

        // Calculate absorption from depot (based on calculated absorption rate)
        var absorbed_from_depot = depot * absorption_day_rate;
        depot -= absorbed_from_depot;
        body_concentration += absorbed_from_depot;

        // Calculate decay (excretion) from body concentration
        body_concentration = body_concentration * elimination_day_rate;

        // Add dose to depot if present for that day
        var dose_for_date = dosing_schedule_data.find(function (entry) {
            return entry[0] === date_string;
        });

        if (dose_for_date) {
            depot += parseFloat(dose_for_date[1]);
        }

        // Convert body concentration from mg to nmol/L
        var body_concentration_nmol = body_concentration * mg_nmmol_ratio;

        // Add the calculated concentration to the data array
        body_concentration_data.push([date_string, body_concentration_nmol.toFixed(2)]);
    });

    // Calculate moving average for a 14-day window, filling missing values with actual averages based on available data
    var moving_average_data = [];
    var window_size = 14;
    for (var i = 0; i < body_concentration_data.length; i++) {
        var sum = 0;
        var count = 0;
        for (var j = i - window_size + 1; j <= i; j++) {
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
        satiety: satiety_data
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
    chart.xAxis().labels().rotation(-80);
    chart.yAxis().title("Body ozempic concentration (nmol/L)");

    //console.log(data);

    // setup series Body concentration
    var series_body_concentration = chart.line(anychart.data.set(data.body_concentration).mapAs({ x: 0, value: 1 }));
    series_body_concentration.name("Body concentration");
    series_body_concentration.tooltip().enabled(true);
    series_body_concentration.legendItem().iconType("line");

    var series_socieity = chart.spline(anychart.data.set(data.satiety).mapAs({ x: 0, value: 1 }));
    series_socieity.name("Satiety");
    series_socieity.stroke({ color: "#FF5733" });
    series_socieity.tooltip().enabled(true);
    series_socieity.legendItem().iconType("line");
    series_socieity.connectMissingPoints(true);

    

    // setup series Dosing schedule
    var adjusted_dosing_schedule_data = data.dosing_schedule
        .map(function (entry) {
            var date = entry[0];
            var dose = parseFloat(entry[1]);
            var corresponding_body_concentration = data.body_concentration.find(
                function (concentration_entry) { return concentration_entry[0] === date; }
            );
            var value = corresponding_body_concentration ? corresponding_body_concentration[1] : entry[1];

            var dose_size_map = { 0: 1, 0.25: 3, 0.5: 5, 1: 8, 2: 12 };
            var marker_size = dose_size_map[parseFloat(dose)] || 5;

            return {
                x: date,
                value: value,
                dose: dose,
                normal: { markerSize: marker_size },
                hovered: { markerSize: marker_size },
                selected: { markerSize: marker_size }
            };
        });

    //console.log(adjusted_dosing_schedule_data);
    var data_set = anychart.data.set(adjusted_dosing_schedule_data);
    var data_mapping = data_set.mapAs({ x: 'x', value: 'value' });

    var series_dosing_schedule = chart.marker(data_mapping);
    series_dosing_schedule.name("Dose");
    series_dosing_schedule.tooltip().enabled(false);

    series_dosing_schedule.labels().enabled(true).anchor("left-center").padding(10).fontSize(9)
    series_dosing_schedule.normal().type("circle")
    series_dosing_schedule.labels().format(function () { return this.getData('dose').toString(); });
    series_dosing_schedule.legendItem().iconType("circle");

    // setup series 14-day Moving Average
    var series_moving_average = chart.spline(anychart.data.set(data.moving_average).mapAs({ x: 0, value: 1 }));
    series_moving_average.name("14-day Moving Average");
    series_moving_average.stroke({ dash: "5 2", thickness: 2, color: "#FF5733" });
    series_moving_average.tooltip().enabled(false);
    series_moving_average.legendItem().iconType("spline");

    var threshold_from = parseFloat(document.getElementById("threshold-from").value);
    var threshold_to = parseFloat(document.getElementById("threshold-to").value);
    chart.rangeMarker().from(threshold_from).to(threshold_to).fill("rgba(0, 255, 0, 0.3)");

    chart.legend().enabled(true).fontSize(13).padding([10, 10, 10, 10]).position("left").align("top").positionMode("inside");

    chart.yScale().ticks().interval(3);
    chart.yScale().minorTicks().interval(1);

    chart.left(20);
    chart.right(20);
    var date_time_scale = anychart.scales.dateTime();
    date_time_scale.ticks().interval('day', 1);
    chart.xScale(date_time_scale);

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

        var date_cell = document.createElement("td");
        var date_input = document.createElement("input");
        date_input.type = "date";
        date_input.value = entry[0];
        date_input.classList.add("date-input");
        date_cell.appendChild(date_input);
        row.appendChild(date_cell);

        var dose_cell = document.createElement("td");
        var dose_input_group = document.createElement("div");
        dose_input_group.classList.add("dose-input-group");
        dose_options.forEach(function (option_value) {
            var label = document.createElement("label");
            var radio = document.createElement("input");
            radio.type = "radio";
            radio.name = `dose-${index}`;
            radio.value = option_value;
            if (option_value == entry[1]) { radio.checked = true; }
            label.appendChild(radio);
            label.appendChild(document.createTextNode(` ${option_value}`));
            dose_input_group.appendChild(label);
        });
        dose_cell.appendChild(dose_input_group);
        row.appendChild(dose_cell);

        tbody.appendChild(row);
    });

    satiety = data.satiety
    var tbody_satiety = document.querySelector("#satiety-table tbody");
    tbody_satiety.innerHTML = "";
    satiety.forEach(function (entry) {
        var row = document.createElement("tr");

        var date_cell = document.createElement("td");
        var date_input = document.createElement("input");
        date_input.type = "date";
        date_input.value = entry[0];
        date_input.classList.add("date-input");
        date_cell.appendChild(date_input);
        row.appendChild(date_cell);

        var satiety_cell = document.createElement("td");
        var satiety_input = document.createElement("input");
        satiety_input.type = "number";
        satiety_input.step = 0.5;
        satiety_input.max = 9;
        satiety_input.min = 0;
        satiety_input.value = entry[1];
        satiety_cell.appendChild(satiety_input);
        row.appendChild(satiety_cell);

        tbody_satiety.appendChild(row);
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
    var dosing_data = [];
    var dosing_rows = document.querySelectorAll("#dosing-schedule-table tbody tr");
    dosing_rows.forEach(function (row, index) {
        var date = row.querySelector(".date-input").value;
        var dose = row.querySelector(`input[name='dose-${index}']:checked`).value;
        dosing_data.push([date, dose]);
    });
    var satiety_data = [];
    var satiety_rows = document.querySelectorAll("#satiety-table tbody tr");
    satiety_rows.forEach(function (row) {
        var date = row.querySelector(".date-input").value;
        var satiety = row.querySelector("input[type='number']").value;
        satiety_data.push([date, satiety]);
    });

    var threshold_from = parseFloat(document.getElementById("threshold-from").value);
    var threshold_to = parseFloat(document.getElementById("threshold-to").value);
    var tmax = parseFloat(document.getElementById("tmax").value);
    var elimination_halflife = parseFloat(document.getElementById("elimination_halflife").value);
    var json_data = {
        dosing_schedule: dosing_data,
        satiety: satiety_data,
        thresholds: {
            from: threshold_from,
            to: threshold_to
        },
        pharmacokinetics: {
            tmax: tmax,
            elimination_halflife: elimination_halflife,
        },
    };
    return json_data;
}

function save_data_to_local_storage(data) {
    localStorage.setItem("ozempic_data", JSON.stringify(data));
}

function save_data_to_json(data) {
    document.getElementById("dosing-json").value = JSON.stringify(data);
}

function save_data_render_chart() {
    var data = get_data_from_html();
    save_data_to_local_storage(data);
    save_data_to_json(data);
    console.log(data);

    var chart_data = calculate_concentration_data(data);
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
    var local_storage_json = localStorage.getItem("ozempic_data");
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
    document.getElementById("add-row-button-dosing").addEventListener("click", add_row_dosing);
    document.getElementById("remove-row-button-dosing").addEventListener("click", remove_row_dosing);
    document.getElementById("add-row-button-satiety").addEventListener("click", add_row_satiety);
    document.getElementById("remove-row-button-satiety").addEventListener("click", remove_row_satiety);

    document.querySelector("#dosing-schedule-table").addEventListener("input", save_data_render_chart);
    document.querySelector("#satiety-table").addEventListener("input", save_data_render_chart);

    document.getElementById("threshold-from").addEventListener("input", save_data_render_chart);
    document.getElementById("threshold-to").addEventListener("input", save_data_render_chart);
    document.getElementById("tmax").addEventListener("input", save_data_render_chart);
    document.getElementById("elimination_halflife").addEventListener("input", save_data_render_chart);
});