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
                var arrival_time = parseInt(line[1]);
                var burst_time = parseInt(line[2]);
                var priority = parseInt(line[3]);
                simulator.processes.push(new Process(id, arrival_time, burst_time, priority));
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
        } else if (algorithm === 'srpt') {
            return new ShortestRemainingProcessingTimeScheduler(simulator.processes);
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
        $(document).on('idle', dom.idle_process);
        $(document).on('requeue', dom.requeue_processes);
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
        var $timeplot = $(templates.idle_timeplot());
        $timeplot.css('margin-left', simulator.elapsed_time / simulator.total_time * 100 + '%').attr('data-start', simulator.elapsed_time);
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
    idle_process: function(e) {
        $process = dom.chart.find('.process-timeline[data-id="' + e.message.id + '"]');
        $timeplot = $(templates.idle_timeplot());
        $timeplot.attr('data-start', simulator.elapsed_time);
        $process.find('.timeline').append($timeplot);
    },
    requeue_processes: function(e) {
        var container = $('<div></div>');
        e.message.forEach(function(process) {
            container.append(dom.system.find('.process[data-id="' + process.id + '"]'));
        });
        dom.system.html(container.html());
    },
    ticktock: function() {
        simulator.elapsed_time++;
        dom.chart.find('.process-timeline:not(.done) .timeline-plot:last-child').each(function() {
            var start = parseInt($(this).attr('data-start'));
            $(this).css('width', (simulator.elapsed_time - start) / simulator.total_time * 100 + '%');
        });
    }
};



function Process(id, arrival_time, burst_time, priority) {
    this.id = id;
    this.arrival_time = arrival_time;
    this.burst_time = burst_time;
    this.remaining_time = burst_time;
    this.priority = priority;

    this.attributes = function() {
        return {
            id: this.id,
            arrival_time: this.arrival_time,
            burst_time: this.burst_time,
            remaining_time: this.remaining_time,
            priority: this.priority
        };
    }
}

function FirstComeFirstServeScheduler(processes) {
    this.processes = processes;
    this.elapsed_time = 0;
    this.t = null;
    var self = this;

    this.initialize = function() {
        dispatch('clear');
        self.elapsed_time = 0;
        self.processes.forEach(function(process) {
            dispatch('queue graph', process);
        });
    };
    this.simulate = function() {
        self.t = setInterval(function() {
            self.elapsed_time++;
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
    this.elapsed_time = 0;
    this.t = null;
    var self = this;

    this.initialize = function() {
        dispatch('clear');
        self.elapsed_time = 0;
        self.processes.forEach(function(process) {
            dispatch('queue graph', process);
        });
    };
    this.simulate = function() {
        self.t = setInterval(function() {
            self.elapsed_time++;
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

function ShortestRemainingProcessingTimeScheduler(processes) {
    this.processes = [];
    this.queue = processes;
    this.elapsed_time = 0;
    this.t = null;
    var self = this;

    this.initialize = function() {
        self.queue = self.queue.sort(arrival_time_comparator);
        while (!self.queue[0].arrival_time) {
            var process = self.queue.shift();
            self.processes.push(process);
            dispatch('queue graph', process);
        }
    };
    this.simulate = function() {
        self.t = setInterval(function() {
            self.elapsed_time++;
            var process = self.processes[0];
            if (process) {
                process.remaining_time--;
                dispatch('update ticktock', process);
                if (!process.remaining_time) {
                    self.processes.shift();
                    dispatch('finish', process);
                }
                while (self.queue.length && self.queue[0].arrival_time === self.elapsed_time) {
                    var incoming = self.queue.shift();
                    self.processes.push(incoming);
                    dispatch('queue graph', incoming);
                    self.processes = self.processes.sort(remaining_time_comparator);
                    if (self.processes[0] !== process) {
                        dispatch('idle', process);
                    }
                    dispatch('requeue', self.processes);
                }
            }
            if (!self.processes.length && !self.queue.length) {
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
                                        + '<p class="arrival-time"><label>AT</label><span><%= arrival_time %></span></p>'
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

function burst_time_comparator(a, b) {
    if (a.burst_time < b.burst_time) {
        return -1;
    } else if (a.burst_time > b.burst_time) {
        return 1;
    }
    return 0;
}

function id_comparator(a, b) {
    if (a.id < b.id) {
        return -1;
    } else if (a.id > b.id) {
        return 1;
    }
    return 0;
}

function arrival_time_comparator(a, b) {
    if (a.arrival_time < b.arrival_time) {
        return -1;
    } else if (a.arrival_time > b.arrival_time) {
        return 1;
    }
    return id_comparator(a, b);
}

function remaining_time_comparator(a, b) {
    if (a.remaining_time < b.remaining_time) {
        return -1;
    } else if (a.remaining_time > b.remaining_time) {
        return 1;
    }
    return arrival_time_comparator(a, b);
}