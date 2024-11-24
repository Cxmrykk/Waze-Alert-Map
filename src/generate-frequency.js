/*
    Algorithm for determining frequency:
    1. Divide alerts into major types or subtypes. (args)
    2. Sort alerts by timeframe.
    3. Go through each alert.
        - If any given alert is within X distance, and within X interval of cached alert, take average location of two points, increase score, and continue.
        - If alert is within distance, but not within interval, minus score or ingore (tbc)
        - If neither, add alert to cache.

    4. Commence post-processing of cached alerts
        - If cached alert within X distance of another cached alert, 
*/