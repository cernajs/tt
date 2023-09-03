﻿    
        function addTweetToFeed(id, username, content, createdAt, likesCount, userId, isLikedByCurrentUser) {
            const feed = $("#tweetFeed");

            const tweetHtml = `
            <div class="clickable-div tweet-wrap" data-tweet-id="@Model.Id">
                <div class="tweet-header">
                    <img src="avatar_url_here" alt="" class="avator">
                    <div class="tweet-header-info">
                        <a href="/User/Index/${userId}">${username}:</a> <span>${createdAt}</span>
                        <p>${content}</p>
                    </div>
                </div>
            
                <div class="tweet-info-counts">
                    <span class="likes">
                        <a href="/Tweet/ShowLikes/${id}">
                        # of likes : <span class="actual-count">${likesCount}</span>
                        </a>
                    </span>
                </div>
            
                <div class="button-container-grid">
                
                <button type="submit" class="reply-button action-btn" data-tweet-id="${id}">Reply</button>

                    <form method="post" action="/Tweet/Retweet" class="retweet-form">
                        <input type="hidden" name="tweetId" value="${id}" />
                        <button class="action-btn" type="submit">Retweet</button>
                    </form>          

                    <form method="post" action="/Tweet/Like" class="like-form">
                        <input type="hidden" name="tweetId" value="${id}" />
                        <button class="action-btn" type="submit">Like</button>
                    </form>

                    <form method="post" action="/Tweet/Bookmark" class="bookmark-form">
                        <input type="hidden" name="tweetId" value="${id}" />
                        <button class="action-btn" type="submit">Bookmark</button>
                    </form>
                
                
                </div>
            </div>
            `;

            feed.prepend(tweetHtml);
        }

        function addChatMessageToFeed(username, message) {
            const feed = $("#chatFeed");

            const chatMessageHtml = `
                <div class="container">
                    <li>
                        ${username}: ${message}
                    </li>
                </div>
            `;

            feed.prepend(chatMessageHtml);
        }


        $(document).ready(function () {

            $(document).on('submit', '.like-form', function(e) {
                e.preventDefault();
                handleLikeUnlike($(this), true);
            });

            $(document).on('submit', '.unlike-form', function(e) {
                e.preventDefault();
                handleLikeUnlike($(this), false);
            });


            function handleLikeUnlike($form, isLike) {
                const formData = $form.serialize(); 
                const url = $form.attr('action');

                $.ajax({
                    url: url,
                    type: 'POST',
                    data: formData,
                    success: function(response) {
                        if (response.success) {
                            if (isLike) {
                                // Swap the "Like" button with "Unlike"
                                $form.removeClass('like-form').addClass('unlike-form');
                                $form.find('button').text('Unlike');
                                $form.attr('action', '/Tweet/Unlike');
                            } else {
                                // Swap the "Unlike" button with "Like"
                                $form.removeClass('unlike-form').addClass('like-form');
                                $form.find('button').text('Like');
                                $form.attr('action', '/Tweet/Like');
                            }

                            // const countElem = $form.closest('li').find('.likes-count .actual-count');
                            const countElem = $form.closest('.tweet-wrap').find('.likes .actual-count');
                            const currentCount = parseInt(countElem.text(), 10); 
                            countElem.text(isLike ? currentCount + 1 : currentCount - 1);
                        } else {
                            alert('Action failed. Try again later.');
                        }
                    },
                    error: function() {
                        alert('Request failed.');
                    }
                });
                return false;
            }


            $("#tweetCreationForm").submit(function (event) {
                event.preventDefault();

                const formData = $(this).serialize();

                $.ajax({
                    url: $(this).attr('action'),
                    type: 'POST',
                    data: formData,
                    success: function (response) {
                        if (response.success) {
                            // tweet is added to the feed through SignalR.
                            $("#tweet").val('');
                        } else {
                            alert('Failed to create tweet!');
                        }
                    },
                    error: function () {
                        alert('Failed to submit tweet!');
                    }
                });
            });


            //SIGNALR
        const connection = new signalR.HubConnectionBuilder()
            .withUrl("/notificationHub")
            .build();

        connection.on("ReceiveNotification", (message) => {
            alert(message);
            updateNotificationCount();
        });


        connection.on("ReceiveTweet", function (id, username, content, createdAt, likesCount, userId, isLikedByCurrentUser) {
            addTweetToFeed(id, username, content, createdAt, likesCount, userId, isLikedByCurrentUser);
        });

        connection.start().catch(err => console.error(err.toString()));

        connection.on("ReceiveChatMessage", function (username, message) {
            addChatMessageToFeed(username, message);
        });

        function updateNotificationCount() {
            $.get("/api/getNotificationCount", function(data) {
                $("#notificationCount").text("Notifications ("+data.notificationCount+")");
            });
        }
        
        $.get("/api/getTrendingTopics", function(data) {
            if(data.length === 0) {
                $("#trendingTopicsList").append("<li>No trending topics</li>");
                return;
            }
            ///Home/Search?searchQuery=%23a
            data.forEach(function(topic) {
                $("#trendingTopicsList").append("<li>" + `<a href=\"Home/Search?searchQuery=%23${topic}\">` + "#" + topic + "<a>" + "</li>");
            });
        });

        $.get("/api/getFollowSuggest", function(data) {
            if(data.length === 0) {
                $("#toFollow").append("<li>Noone to follow</li>");
                return;
            }
            ///User/Index/a67709e6-37ab-4810-a91d-c6c075c5e003
            data.forEach(function(user) {
                $("#toFollow").append("<li>" + `<a href=\"/User/Index/${user.id}\">` + user.userName + "</a>" +"</li>");
            });
        });


        $("#sendChatButton").click(function() {
            sendMessage();
        });

        connection.on("ReceiveMessage", function (message, username) {

            // var messageElement = `<div class="otherMessage">${username}: ${message}</div>`;
            var messageElement = `<div class="otherMessage">
                                    <span>${username}: ${message}</span>
                                    <span class="timestamp">${getFormattedDateTime('Europe/Berlin')}</span>
                                </div>`;
            document.getElementById("chatArea").innerHTML += messageElement;
        });

        
        function getFormattedDateTime(timeZone) {
            const date = new Date();
            
            const options = {
              timeZone,
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            };
            
            const formatter = new Intl.DateTimeFormat('de-DE', options);
            return formatter.format(date);
          }


        function sendMessage() {
            var message = document.getElementById("messageInput").value;
            var messageElement = `<div class="myMessage">
                                    <span>${currentUserName}: ${message}</span>
                                    <span class="timestamp">${getFormattedDateTime('Europe/Berlin')}</span>
                                </div>`;
            document.getElementById("chatArea").innerHTML += messageElement;
            document.getElementById("messageInput").value = "";
            connection.invoke("SendMessage", otherUserId, message).catch(function (err) {
                return console.error(err.toString());
            });

            $.ajax({
                url: "/Chat/CreateMessage",
                type: "POST",
                data: JSON.stringify({ RecipientId: otherUserId, Content: message }),
                contentType: "application/json",
                success: function(response) {
                    if (response.success) {
                        // Message saved successfully
                    }
                },
                error: function() {
                    alert("Failed to save the message.");
                }
            });
        }

        // EDIT PROFILE MODAL
        const $modal = $('#editProfileModal');
        const $closeButton = $('#closeModal');
        const $editProfileForm = $('#editProfileForm');

        // Show the modal
        $('#editProfileButton').click(function() {
            $modal.show();
        });

        // Close the modal when the close button is clicked
        $closeButton.click(function() {
            $modal.hide();
        });

        $(window).click(function(event) {
            if (event.target.id === 'editProfileModal') {
            $modal.hide();
            }
        });

        $editProfileForm.submit(function(e) {
            e.preventDefault();
        
            var formData = {
                Id: $('#userId').val(),
                UserName: $('#username').val(),
                Email: $('#email').val()
            };
        
            $.ajax({
                url: '/User/EditProfile',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(formData),
                success: function(response) {
                    console.log(response);
                    $modal.hide();
                    location.reload();
                },
                error: function(error) {
                    console.log(error);
                }
            });
        });


        $(".clickable-div").on("click", function () {
            const tweetId = $(this).data("tweet-id");
            window.location.href = '/Tweet/ViewReplies/' + tweetId;
        });

        $(".chat").on("click", function () {
            const chatId = $(this).data("tweet-id");
            window.location.href = '/Chat/ChatWithSpecificUser/' + chatId;
        });


        // Tweet buttons
        $(".action-btn").on("click", function (event) {
            event.stopPropagation();
        });

        $(".reply-button").on("click", function () {
            const tweetId = $(this).data("tweet-id");
            const $modalReply = $('.reply-modal[data-tweet-id="' + tweetId + '"]');
            $modalReply.show();
        });
    
        $(".close-button").on("click", function () {
            const tweetId = $(this).closest('.reply-modal').data("tweet-id");
            const $modalReply = $('.reply-modal[data-tweet-id="' + tweetId + '"]');
            $modalReply.hide();
        });
        


        // Bookmark buttons
        $(document).on('submit', '.bookmark-form', function(e) {
            e.preventDefault();
            handleBookmarkUnbookmark($(this), true);
        });

        $(document).on('submit', '.unbookmark-form', function(e) {
            e.preventDefault();
            handleBookmarkUnbookmark($(this), false);
        });

        function handleBookmarkUnbookmark($form, isBookmark) {
            const url = $form.attr('action');
            const tweetId = $form.find('input[name="tweetId"]').val();

            $.ajax({
                url: url,
                type: 'POST',
                data: { tweetId: tweetId, isBookmarked : isBookmark },
                success: function(response) {
                    if (response.success) {
                        if (isBookmark) {
                            // Swap the "Bookmark" button with "Unbookmark"
                            $form.removeClass('bookmark-form').addClass('unbookmark-form');
                            $form.find('button').text('Unbookmark');

                        } else {
                            // Swap the "Unbookmark" button with "Bookmark"
                            $form.removeClass('unbookmark-form').addClass('bookmark-form');
                            $form.find('button').text('Bookmark');

                        }
                    } else {
                        alert('Action failed. Try again later.');
                    }
                },
                error: function() {
                    alert('Request failed.');
                }
            });
            return false;
        }

        // Retweet buttons
        $(document).on('submit', '.retweet-form', function(e) {
            e.preventDefault();
            handleRetweetUnretweet($(this), true);
        });

        $(document).on('submit', '.unretweet-form', function(e) {
            e.preventDefault();
            handleRetweetUnretweet($(this), false);
        });

        function handleRetweetUnretweet($form, isRetweet) {
            const url = $form.attr('action');
            const tweetId = $form.find('input[name="tweetId"]').val();

            $.ajax({
                url: url,
                type: 'POST',
                data: { tweetId: tweetId, isRetweet : isRetweet },
                success: function(response) {
                    if (response.success) {
                        if (isRetweet) {
                            $form.removeClass('retweet-form').addClass('unretweet-form');
                            $form.find('button').text('Unretweet');

                        } else {
                            $form.removeClass('unretweet-form').addClass('retweet-form');
                            $form.find('button').text('Retweet');

                        }
                    } else {
                        alert('Action failed. Try again later.');
                    }
                }
            });
            return false;
        }

    });
