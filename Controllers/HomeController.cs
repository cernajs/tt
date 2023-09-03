﻿using System.Security.AccessControl;
using Internal;
using System;
using Microsoft.AspNetCore.Identity;
using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;

using TwitterClone.Data;
using TwitterClone.Models;
using TwitterClone.Hubs;
using TwitterClone.SD;


namespace TwitterClone.Controllers;

public class HomeController : Controller
{
    private readonly ILogger<HomeController> _logger;
    private readonly TwitterContext _tweetRepo;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly ITweetRetrievalStrategy _viewStrategy;
    private readonly IPopularTweetStrategy _popularTweetStrategy;

    public HomeController(ILogger<HomeController> logger, TwitterContext db,
                         UserManager<ApplicationUser> userManager, IHubContext<NotificationHub> hubContext,
                         ITweetRetrievalStrategy viewStrategy,
                         IPopularTweetStrategy popularTweetStrategy)
    {
        _logger = logger;
        _tweetRepo = db;
        _userManager = userManager;
        _hubContext = hubContext;
        _viewStrategy = viewStrategy;
        _popularTweetStrategy = popularTweetStrategy;
    }


    public async Task<IActionResult> Index()
    {
        //retreive tweets by given strategy
        //var tweets = await _viewStrategy.GetTweetsAsync(userId : null);

        var tweets = await _tweetRepo.Tweets
            .Include(t => t.User)
            .Include(t => t.Likes)
            .Include(t => t.Bookmarks)
            .Include(t => t.Replies)
            .Include(t => t.Retweets)
            .Include(t => t.Replies).ToListAsync();

        return View(tweets);
    }

    /// <summary>
    ///     Search for tweets by username or hashtag depending on the search query.
    /// </summary>
    /// <param name="searchQuery"></param>
    /// <returns></returns>
    public async Task<IActionResult> Search(string searchQuery)
    {
        ISearchStrategy searchStrategy;

        if (!string.IsNullOrEmpty(searchQuery)) {
            if (searchQuery.StartsWith("#"))
            {
                Console.WriteLine("searching by hashtag");
                searchStrategy = new HashtagSearch();
            }
            else
            {
                searchStrategy = new UsernameSearch();
            }
            var tweets = await searchStrategy.SearchAsync(searchQuery, _tweetRepo);
            return View("Index", tweets);
        }
        else {
            var tweets = _tweetRepo.Tweets.Include(t => t.User).ToList();
            return View("Index", tweets);
        }
        
    }

    [HttpPost]
    public async Task<IActionResult> Create(string username, string tweet)
    {
        Console.WriteLine("tweet is :" + tweet);

        var user = await _userManager.GetUserAsync(User);

        if(user == null || string.IsNullOrEmpty(tweet))
        {
            return RedirectToAction("Index", "Home");
        }

        MatchCollection matches = Regex.Matches(tweet, @"#\w+");
        List<string> hashtags = matches.Cast<Match>().Select(match => match.Value).ToList();
        
        if(hashtags.Count != 0) 
        {
            tweet = StaticMethods.ConvertToHtmlWithClickableHashtags(tweet);
        }

        var newTweet = new Tweet
        { 
            UserId = user.Id, 
            Username = user.UserName, 
            TweetContent = tweet, 
            CreatedAt = DateTime.Now,
            User = user
        };

        _tweetRepo.Tweets.Add(newTweet);
        //_tweetRepo.SaveChanges();

        

        if(hashtags.Count != 0)
        {
            
            var tweetHashtags = new List<TweetHashtag>();
            foreach(var hashtag in hashtags)
            {
                
                var newHashtag = new Hashtag
                {
                    Tag = hashtag.Substring(1)
                };
                _tweetRepo.Hashtags.Add(newHashtag);


                var newTweetHashtag = new TweetHashtag
                {
                    TweetId = newTweet.Id,
                    HashtagId = newHashtag.Id
                };
                tweetHashtags.Add(newTweetHashtag);
            }
            _tweetRepo.TweetHashtags.AddRange(tweetHashtags);
            
        }

        await _tweetRepo.SaveChangesAsync();

        await NotifyFollowersOfNewTweet(user.Id, "New tweet posted!", newTweet.Id);

                                                            //( id,         username,       content, createdAt,           likesCount,            userId,   isLikedByCurrentUser)
        await _hubContext.Clients.All.SendAsync("ReceiveTweet", newTweet.Id, user.UserName, tweet, DateTime.Now.ToString(), newTweet.Likes.Count, user.Id, false );


        return Json(new { success = true });
    }

    private async Task NotifyFollowersOfNewTweet(string userId, string message, int tweetId)
    {
        // Fetch all followers of the user.
        var followers = await _tweetRepo.UserFollowers
            .Where(uf => uf.FollowingId == userId)
            .Select(uf => uf.FollowerId)
            .ToListAsync();

        foreach(var follower in followers)
        {

            var notification = new Notification
            {
                UserId = follower,
                Message = message,
                TweetId = tweetId,
                Timestamp = DateTime.Now
            };

            _tweetRepo.Notifications.Add(notification);
            await _tweetRepo.SaveChangesAsync();

            await _hubContext.Clients.User(follower).SendAsync("ReceiveNotification", message);
        }
    }

    [Authorize]
    public async Task<IActionResult> Popular() {
        var popularTweets = await _popularTweetStrategy.GetTweetsAsync();

        popularTweets ??= new List<Tweet>();

        return View(popularTweets);
    }

    [HttpGet("api/getNotificationCount")]
    public async Task<IActionResult> GetNotificationCount()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Challenge();

        var notificationCount = await _tweetRepo.Notifications
            .Where(n => n.UserId == user.Id && !n.IsSeen)
            .CountAsync();

        return Json(new { notificationCount });
    }

    [Authorize]
    public async Task<IActionResult> ShowNotifications()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Challenge();

        var notifications = await _tweetRepo.Notifications
            .Where(n => n.UserId == user.Id)
            .OrderByDescending(n => n.Timestamp)
            .ToListAsync();

        return View(notifications);
    }

    [HttpGet("api/getTrendingTopics")]
    public async Task<IActionResult> GetTrendingTopics()
    {
        var trendingTopics = await _tweetRepo.Hashtags
            .OrderByDescending(h => h.TweetHashtags.Count)
            .Take(3)
            .Select(h => h.Tag)
            .ToListAsync();

        return Json(trendingTopics);
    }

    [HttpGet("/api/getFollowSuggest")]
    public async Task<IActionResult> GetFollowSuggest()
    {
        var user = await _userManager.GetUserAsync(User);
        if (user == null) return Json(new List<ApplicationUser>());

        var followSuggest = await _tweetRepo.Users
            .Where(u => u.Id != user.Id)
            .OrderBy(u => Guid.NewGuid())
            .Take(3)
            .ToListAsync();

        return Json(followSuggest);
    }

    public IActionResult Privacy()
    {
        return View();
    }

    [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
    public IActionResult Error()
    {
        return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
    }
}
