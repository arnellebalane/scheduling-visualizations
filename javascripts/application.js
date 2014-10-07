$(document).ready(function() {
    $('#input').on('change', simulator.parse);
    $('#algorithm').on('change', function() {
        $('button').prop('disabled', false);
    });
    $('button').on('click', simulator.simulate);
});

var simulator = {
    processes: [],
    processor: null,
    parse: function(e) {
        var reader = new FileReader();
        reader.onload = function(data) {
            $('#input span').text(e.target.files[0].name);
            simulator.processes = [];
            data.target.result.split('\n').slice(1).forEach(function(line) {
                line = line.replace(/( |\t)+/g, ' ').split(' ');
                var id = parseInt(line[0]);
                var arrival = parseInt(line[1]);
                var burst_time = parseInt(line[2]);
                var priority = parseInt(line[3]);
                simulator.processes.push(new Process(id, arrival, burst_time, priority));
            });
        }
        reader.readAsText(e.target.files[0]);
    },
    simulate: function() {
        simulator.processor = simulator.get_processor();
        simulator.processor.simulate();
    },
    get_processor: function() {
        var algorithm = $('#algorithm').val();
        if (algorithm === 'fcfs') {
            return new FirstComeFirstServeScheduler(simulator.processes);
        }
    }
};

var templates = {
    process: _.template('<div class="process">'
                            + '<div class="overlay vertical-overlay"></div>'
                            + '<div class="overlay horizontal-overlay"></div>'
                            + '<div class="process-content">'
                                + '<h4><%= id %></h4>'
                                + '<p class="arrival"><label>AT</label><span><%= arrival %></span></p>'
                                + '<p class="burst-time"><label>BT</label><span><%= burst_time %></span></p>'
                                + '<p class="remaining-time"><label>RT</label><span><%= remaining_time %></span></p>'
                                + '<p class="priority"><label>P</label><span><%= priority %></span></p>'
                            + '</div>'
                        + '</div>')
};



function Process(id, arrival, burst_time, priority) {
    this.id = id;
    this.arrival = arrival;
    this.burst_time = burst_time;
    this.remaining_time = burst_time;
    this.priority = priority;

    this.attributes = function() {
        return {
            id: this.id,
            arrival: this.arrival,
            burst_time: this.burst_time,
            remaining_time: this.remaining_time,
            priority: this.priority
        };
    }
}

function FirstComeFirstServeScheduler(processes) {
    this.processes = processes;
    this.dom = $('.system');
    this.t = null;
    var self = this;

    this.initialize = function() {
        self.dom.empty();
        self.processes.forEach(function(process) {
            var $process = templates.process(process.attributes());
            self.dom.append($process);
        });
    };
    this.simulate = function() {
        self.t = setInterval(function() {
            var process = self.processes[0];
            var $process = self.dom.find('.process').first();
            process.remaining_time--;
            $process.find('.remaining-time span').text(process.remaining_time);
            $process.find('.vertical-overlay').css({ 'height': (process.remaining_time / process.burst_time) * 100 + '%' });
            $process.find('.horizontal-overlay').css({ 'width': (process.remaining_time / process.burst_time) * 100 + '%' });
            if (!process.remaining_time) {
                self.processes.shift();
                $process.remove();
            }
        }, 1000);
    };
    this.initialize();
}