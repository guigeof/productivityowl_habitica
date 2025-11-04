// Define the Habitica integration module
;(function(window, $) {
    'use strict';
    
    // Create HABITICA namespace if it doesn't exist
    window.HABITICA = window.HABITICA || {};

    // Define the API module
    var API = (function() {
        var API_URL = "https://habitica.com/api/v3/";

        // Mark a Habitica task as completed via the API
        // Requires: taskId (Habitica task id), callback (optional)
        function completeHabiticaTask(taskId, callback) {
            var userId = localStorage['habitica_user_id'];
            var apiToken = localStorage['habitica_api_token'];
            if (!userId || !apiToken) {
                if (callback) callback('Missing Habitica credentials');
                return;
            }
            $.ajax({
                url: API_URL + "tasks/" + encodeURIComponent(taskId) + "/score/up",
                type: "POST",
                headers: {
                    'x-api-user': userId,
                    'x-api-key': apiToken,
                    'x-client': userId + "-ProductivityOwl",
                    'Content-Type': 'application/json'
                },
                success: function(response) {
                    if (callback) callback(null, response);
                },
                error: function(xhr, status, error) {
                    let errMsg = error;
                    if (xhr && xhr.responseJSON && xhr.responseJSON.message) {
                        errMsg = xhr.responseJSON.message;
                    } else if (xhr && xhr.responseText) {
                        errMsg = xhr.responseText;
                    }
                    console.error('Habitica API error:', errMsg);
                    if (callback) callback(errMsg);
                }
            });
        }
    // Helper: Get or create the "Owl" tag in Habitica, returns a Promise resolving to the tag ID
    function getOrCreateOwlTag(headers) {
        return $.ajax({
            url: API_URL + "tags",
            type: "GET",
            headers: headers
        }).then(function(tagResp) {
            let owlTag = tagResp.data.find(tag => tag.name === "Owl");
            if (owlTag) return owlTag.id;
            // Create the tag if not found
            return $.ajax({
                url: API_URL + "tags",
                type: "POST",
                headers: headers,
                contentType: "application/json",
                data: JSON.stringify({ name: "Owl" })
            }).then(newTagResp => newTagResp.data.id);
        });
    }

        function getHeaders() {
            var userId = localStorage['habitica_user_id'];
            var apiToken = localStorage['habitica_api_token'];

            if (!userId || !apiToken) {
                return null;
            }

            return {
                "x-api-user": userId,
                "x-api-key": apiToken,
                "x-client": userId + "-ProductivityOwl",
                "Content-Type": "application/json"
            };
        }

        function syncTasks() {
            var headers = getHeaders();
            if (!headers) {
                owlMessage("Please enter your Habitica User ID and API Token.");
                return;
            }

            const tasksJson = localStorage['tasks'];
            if (!tasksJson) {
                owlMessage("No tasks to sync.");
                return;
            }

            const localTasks = JSON.parse(tasksJson);
            // Log local tasks
            console.log('%c🦉 Local Tasks:', 'color: #4b97f4; font-weight: bold;');
            let index = 1;
            for (const task of localTasks) {
                console.log(`${index++}. ${task.text}`);
            }
            // Fetch existing tasks from Habitica
            return $.ajax({
                url: API_URL + "tasks/user",
                type: "GET",
                headers: headers,
                data: { type: 'todos' }
            }).then(function(habiticaTasks) {
                // Log Habitica tasks
                console.log('%c⚔️ Habitica Tasks:', 'color: #4b97f4; font-weight: bold;');
                index = 1;
                for (const task of habiticaTasks.data) {
                    console.log(`${index++}. ${task.text} (${task.id})`);
                }
                const habiticaTaskTexts = habiticaTasks.data.map(task => task.text);
                // Log sync status
                console.log('%c🔄 Syncing Tasks:', 'color: #50b068; font-weight: bold;');
                for (const localTask of localTasks) {
                    // Support both 'text' and 'task_text' properties
                    const taskText = typeof localTask.text === 'string' && localTask.text.trim()
                        ? localTask.text.trim()
                        : (typeof localTask.task_text === 'string' && localTask.task_text.trim() ? localTask.task_text.trim() : undefined);
                    if (!taskText) {
                        console.warn('Skipping invalid or undefined task:', localTask);
                        continue;
                    }
                    const exists = habiticaTaskTexts.includes(taskText);
                    console.log(
                        `${exists ? '✓' : '+'} ${taskText} ${exists ? '(already exists)' : '(will be created)'}`
                    );
                    if (!exists) {
                        // Pass subtasks if present
                        createTask(taskText, localTask.subtasks);
                    }
                }
            }).fail(function(error) {
                console.error("Error fetching tasks:", error);
                owlMessage("Error fetching tasks from Habitica. Please check your settings.");
            });
        }
        // Create a Habitica task with Owl tag and optional subtasks (as checklist in notes)
        function createTask(taskText, subtasks) {
            const headers = getHeaders();
            if (!headers) return;

            getOrCreateOwlTag(headers).then(function(owlTagId) {
                let notes = "";
                if (Array.isArray(subtasks) && subtasks.length > 0) {
                    notes = "Subtasks:\n" + subtasks.map((s, i) => `- [ ] ${s.text || s.task_text || s}`).join("\n");
                }
                const task = {
                    text: taskText,
                    type: "todo",
                    tags: [owlTagId],
                    notes: notes
                };
                return $.ajax({
                    url: API_URL + "tasks/user",
                    type: "POST",
                    headers: headers,
                    contentType: "application/json",
                    data: JSON.stringify(task)
                }).then(function(data) {
                    console.log('%c✅ Task Created:', 'color: #50b068; font-weight: bold;');
                    console.log(`Task: ${taskText}`);
                    console.log(`ID: ${data.data.id}`);
                    console.log(`Status: ${data.data.status}`);
                    owlMessage(`Task '${taskText}' synced with Habitica.`);
                    return data;
                }).fail(function(error) {
                    console.error('%c❌ Error Creating Task:', 'color: #ff4444; font-weight: bold;');
                    console.error(`Task: ${taskText}`);
                    console.error(`Error: ${error.responseJSON?.message || error.statusText}`);
                    owlMessage(`Error syncing task '${taskText}'. Please check your Habitica settings.`);
                    throw error;
                });
            });
        }
        // Import Habitica todos, with selection UI stub and default filter by "Owl" tag
        function importTodosWithSelection(callback) {
            const headers = getHeaders();
            if (!headers) return;
            getOrCreateOwlTag(headers).then(function(owlTagId) {
                // Fetch all todos
                $.ajax({
                    url: API_URL + "tasks/user",
                    type: "GET",
                    headers: headers,
                    data: { type: 'todos' }
                }).then(function(resp) {
                    const todos = resp.data;
                    // Filter by Owl tag by default
                    const owlTodos = todos.filter(todo => Array.isArray(todo.tags) && todo.tags.includes(owlTagId));
                    // UI stub: present selection dialog (to be implemented in options/popup)
                    // For now, just call callback with default selection (Owl-tagged todos)
                    if (typeof callback === 'function') {
                        callback(owlTodos, todos, owlTagId);
                    }
                });
            });
        }
        // Expose importTodosWithSelection for UI integration
        window.HABITICA.importTodosWithSelection = importTodosWithSelection;

        function getUser() {
            const headers = getHeaders();
            if (!headers) return Promise.reject("Missing Habitica credentials");
            return $.ajax({
                url: API_URL + "user",
                type: "GET",
                headers: headers
            });
        }

        function updateUser(updateData) {
            const headers = getHeaders();
            if (!headers) return Promise.reject("Missing Habitica credentials");
            return $.ajax({
                url: API_URL + "user",
                type: "PUT",
                headers: headers,
                contentType: "application/json",
                data: JSON.stringify(updateData)
            });
        }

        function syncCoins() {
            const conversionRate = parseFloat(localStorage['habitica_coin_conversion_rate']);
            if (isNaN(conversionRate) || conversionRate <= 0) {
                owlMessage("Invalid conversion rate. Please set a valid rate in the options.");
                return;
            }

            let originalCoins = 0;

            getUser().then(function(user) {
                originalCoins = user.data.stats.gp;

                if (originalCoins <= 0) {
                    owlMessage("You have no coins to convert.");
                    return Promise.reject("No coins"); // Abort chain
                }
                // Setting coins to 0 is the simplest interpretation of "converting all coins".
                return updateUser({ "stats.gp": 0 });

            }).then(function(updateResponse) {
                // Coins were successfully set to 0 in Habitica
                const timeToAdd = originalCoins / conversionRate;
                let currentVacationTime = parseFloat(localStorage['vacation_time']) || 0;
                const newTotalTime = currentVacationTime + timeToAdd;

                localStorage['vacation_time'] = newTotalTime;

                owlMessage(`Converted ${originalCoins.toFixed(2)} coins to ${timeToAdd.toFixed(2)} minutes. You now have a total of ${newTotalTime.toFixed(2)} minutes.`);

            }).fail(function(error) {
                if (error !== "No coins") {
                     owlMessage("Failed to update coins on Habitica. Conversion cancelled.");
                }
            });
        }

        return {
            syncTasks: syncTasks,
            createTask: createTask,
            completeHabiticaTask: completeHabiticaTask,
            syncCoins: syncCoins
        };
    })();

    // Assign the API module to the HABITICA namespace
    window.HABITICA.API = API;
})(window, jQuery);
