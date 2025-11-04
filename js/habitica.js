var HABITICA = HABITICA || {};

HABITICA.API = (function() {
    var API_URL = "https://habitica.com/api/v3/";

    function getHeaders() {
        var userId = localStorage['habitica_user_id'];
        var apiToken = localStorage['habitica_api_token'];

        if (!userId || !apiToken) {
            return null;
        }

        return {
            "x-api-user": userId,
            "x-api-key": apiToken,
            "Content-Type": "application/json"
        };
    }

    function syncTasks() {
        var headers = getHeaders();
        if (!headers) {
            owlMessage("Please enter your Habitica User ID and API Token.");
            return;
        }

        var tasksJson = localStorage['tasks'];
        if (!tasksJson) {
            owlMessage("No tasks to sync.");
            return;
        }

        var localTasks = JSON.parse(tasksJson);
        if (!localTasks || localTasks.length === 0) {
            owlMessage("No tasks to sync.");
            return;
        }

        // Fetch existing tasks from Habitica
        $.ajax({
            url: API_URL + "tasks/user",
            type: "GET",
            headers: headers,
            success: function(habiticaTasks) {
                var habiticaTaskTexts = habiticaTasks.data.map(function(task) {
                    return task.text;
                });

                localTasks.forEach(function(localTask) {
                    if (habiticaTaskTexts.indexOf(localTask.text) === -1) {
                        createTask(localTask.text);
                    }
                });
            },
            error: function(error) {
                console.error("Error fetching tasks:", error);
                owlMessage("Error fetching tasks from Habitica. Please check your settings.");
            }
        });
    }

    function createTask(taskText) {
        var headers = getHeaders();
        if (!headers) {
            return;
        }

        var task = {
            text: taskText,
            type: "todo",
            tags: ["OWL"]
        };

        $.ajax({
            url: API_URL + "tasks/user",
            type: "POST",
            headers: headers,
            data: JSON.stringify(task),
            success: function(data) {
                console.log("Task created successfully:", data);
                owlMessage("Task '" + taskText + "' synced with Habitica.");
            },
            error: function(error) {
                console.error("Error creating task:", error);
                owlMessage("Error syncing task '" + taskText + "'. Please check your Habitica settings.");
            }
        });
    }

    return {
        syncTasks: syncTasks,
        createTask: createTask
    };
})();
