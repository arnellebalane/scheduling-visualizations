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
    total_time: 0,
    elapsed_time: 0,
    frame_speed: 100,
    parse: function(e) {
        var reader = new FileReader();
        reader.onload = function(data) {
            $('#input span').text(e.target.files[0].name);
            simulator.processes = [];
            simulator.total_time = 0;
            data.target.result.split('\n').slice(1).forEach(function(line) {
                line = line.replace(/( |\t)+/g, ' ').split(' ');
                var id = parseInt(line[0]);
                var arrival = parseInt(line[1]);
                var burst_time = parseInt(line[2]);
                var priority = parseInt(line[3]);
                simulator.processes.push(new Process(id, arrival, burst_time, priority));
                simulator.total_time += burst_time;
            });
        }
        reader.readAsText(e.target.files[0]);
    },
    simulate: function() {
        dom.initialize();
        simulator.elapsed_time = 0;
        simulator.processor = simulator.get_processor();
        simulator.processor.simulate();
    },
    get_processor: function() {
        var algorithm = $('#algorithm').val();
        if (algorithm === 'fcfs') {
            return new FirstComeFirstServeScheduler(simulator.processes);
        } else if (algorithm === 'sjf') {
            return new ShortestJobFirstScheduler(simulator.processes);
        }
    }
};

var dom = {
    system: $('.system'),
    chart: $('.chart'),
    initialize: function() {
        $(document).on('clear', dom.clear_system);
        $(document).on('queue', dom.queue_process);
        $(document).on('graph', dom.graph_process);
        $(document).on('update', dom.update_process);
        $(document).on('finish', dom.finish_process);
        $(document).on('ticktock', dom.ticktock);
    },
    clear_system: function() {
        dom.system.empty();
    },
    queue_process: function(e) {
        var $process = templates.process_queue(e.message.attributes());
        dom.system.append($process);
    },
    graph_process: function(e) {
        var $process = $(templates.process_timeline(e.message.attributes()));
        var $timeplot = $(templates[simulator.elapsed_time ? 'default_timeplot' : 'idle_timeplot']());
        $timeplot.attr('data-start', simulator.elapsed_time);
        $process.find('.timeline').append($timeplot);
        var before = dom.chart.find('.process-timeline').filter(function() {
            return parseInt($process.data('id')) < parseInt($(this).data('id'));
        }).first();
        if (before.length) {
            before.before($process);
        } else {
            dom.chart.append($process);
        }
    },
    update_process: function(e) {
        var process = e.message;
        var $process = dom.system.find('.process[data-id="' + process.id + '"]');
        var $timeline = dom.chart.find('.process-timeline[data-id="' + process.id + '"] .timeline');
        $process.find('.remaining-time span').text(process.remaining_time);
        $process.find('.vertical-overlay').css({ 'height': (process.remaining_time / process.burst_time) * 100 + '%' });
        $process.find('.horizontal-overlay').css({ 'width': (process.remaining_time / process.burst_time) * 100 + '%' });
        if (!$timeline.find('.timeline-plot').last().hasClass('active')) {
            var $timeplot = $(templates.active_timeplot());
            $timeplot.attr('data-start', simulator.elapsed_time);
            $timeline.append($timeplot);
        }
    },
    finish_process: function(e) {
        dom.system.find('.process[data-id="' + e.message.id + '"]').remove();
        dom.chart.find('.process-timeline[data-id="' + e.message.id + '"]').addClass('done');;
    },
    ticktock: function() {
        simulator.elapsed_time++;
        dom.chart.find('.process-timeline:not(.done) .timeline-plot:last-child').each(function() {
            var start = parseInt($(this).attr('data-start'));
            $(this).css('width', (simulator.elapsed_time - start) / simulator.total_time * 100 + '%');
        });
    }
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
    this.t = null;
    var self = this;

    this.initialize = function() {
        dispatch('clear');
        self.processes.forEach(function(process) {
            dispatch('queue graph', process);
        });
    };
    this.simulate = function() {
        self.t = setInterval(function() {
            var process = self.processes[0];
            process.remaining_time--;
            dispatch('update ticktock', process);
            if (!process.remaining_time) {
                self.processes.shift();
                dispatch('finish', process);
            }
            if (!self.processes.length) {
                self.stop();
            }
        }, simulator.frame_speed);
    };
    this.stop = function() {
        clearInterval(self.t);
    };
    this.initialize();
}

function ShortestJobFirstScheduler(processes) {
    this.processes = processes.sort(burst_time_comparator);
    this.dom = $('.system');
    this.t = null;
    var self = this;

    function burst_time_comparator(a, b) {
        if (a.burst_time < b.burst_time) {
            return -1;
        } else if (a.burst_time > b.burst_time) {
            return 1;
        }
    }

    this.initialize = function() {
        dispatch('clear');
        self.processes.forEach(function(process) {
            dispatch('queue graph', process);
        });
    };
    this.simulate = function() {
        self.t = setInterval(function() {
            var process = self.processes[0];
            process.remaining_time--;
            dispatch('update ticktock', process);
            if (!process.remaining_time) {
                self.processes.shift();
                dispatch('finish', process);
            }
            if (!self.processes.length) {
                self.stop();
            }
        }, simulator.frame_speed);
    };
    this.stop = function() {
        clearInterval(self.t);
    };
    this.initialize();
}



// EXTRA STUFF
var templates = {
    process_queue: _.template('<div class="process" data-id="<%= id %>">'
                                    + '<div class="overlay vertical-overlay"></div>'
                                    + '<div class="overlay horizontal-overlay"></div>'
                                    + '<div class="process-content">'
                                        + '<h4><%= id %></h4>'
                                        + '<p class="arrival"><label>AT</label><span><%= arrival %></span></p>'
                                        + '<p class="burst-time"><label>BT</label><span><%= burst_time %></span></p>'
                                        + '<p class="remaining-time"><label>RT</label><span><%= remaining_time %></span></p>'
                                        + '<p class="priority"><label>P</label><span><%= priority %></span></p>'
                                    + '</div>'
                                + '</div>'),
    process_timeline: _.template('<div class="process-timeline" data-id="<%= id %>">'
                                        + '<label><%= id %></label>'
                                        + '<div class="timeline"></div>'
                                    + '</div>'),
    default_timeplot: _.template('<div class="timeline-plot"></div>'),
    active_timeplot: _.template('<div class="timeline-plot active"></div>'),
    idle_timeplot: _.template('<div class="timeline-plot idle"></div>')
};

function dispatch(type, message) {
    type.split(' ').forEach(function(t) {
        $(document).trigger({ type: t, message: message });
    });
}