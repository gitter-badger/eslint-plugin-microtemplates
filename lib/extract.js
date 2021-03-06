/**
 * @fileoverview Utility for extracting executable code from microtemplates.
 * @author Kevin Partington
 * @copyright 2015 Kevin Partington. All rights reserved.
 */

"use strict";

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

var delimiters = {
    evaluate: /<%([\s\S]+?)%>/g,
    interpolate: /<%=([\s\S]+?)%>/g,
    escape: /<%-([\s\S]+?)%>/g
};

//------------------------------------------------------------------------------
// Public interface
//------------------------------------------------------------------------------

module.exports = function(text) {
    var matcher = RegExp([
        delimiters.escape.source,
        delimiters.interpolate.source,
        delimiters.evaluate.source,
        "$"
    ].join("|"), "g");

    var currentIndex = 0,
        currentLine = 1,
        currentColumn = 1,
        escapeMatcher = /\\|\r|\n|\u2028|\u2029|'/g,
        newlineMatcher = /\r\n|\r|\n|\u2028|\u2029/g,
        lines = [{ code: "/*global print*/" }],
        escapes = {
            "'": "'",
            "\\": "\\",
            "\r": "r",
            "\n": "n",
            "\u2028": "u2028",
            "\u2029": "u2029"
        },
        escapeChar = function(match) {
            return "\\" + escapes[match];
        };

    function processTextBeforeDelimiter(match, offset) {
        // Get text before the delimiter we just matched on and make it
        // suitable for string injection
        var textBeforeDelimiter,
            escapedTextBeforeDelimiter,
            newlines,
            lastNewline,
            startOfLineIndex;

        // Most of our operations only need to occur if there was actual
        // text before the delimiter.
        if (offset > 0) {
            textBeforeDelimiter = text.slice(currentIndex, offset);
            escapedTextBeforeDelimiter = textBeforeDelimiter.replace(escapeMatcher, escapeChar);

            // 1. Add "print()" line for text up until now.
            // Since this is plain text, not code, we want to avoid ESLint errors.
            lines.push({
                code: "print('" + escapedTextBeforeDelimiter + "'); // eslint-disable-line"
            });

            // 2. Determine what line we are on now
            newlines = textBeforeDelimiter.match(newlineMatcher) || [];
            currentLine += newlines.length;

            // 3. Determine column offset for match
            if (newlines.length) {
                lastNewline = newlines[newlines.length - 1];
                startOfLineIndex = textBeforeDelimiter.lastIndexOf(lastNewline) + lastNewline.length;

                currentColumn = textBeforeDelimiter.length - startOfLineIndex + 1;
            } else {
                currentColumn += textBeforeDelimiter.length;
            }
        }

        // Finally, update currentIndex to include offset and match length
        currentIndex = offset + match.length;
    }

    text.replace(matcher, function(fullMatch, escape, interpolate, evaluate, offset) {
        var newLines,
            matchedCode = escape || interpolate || evaluate;

        processTextBeforeDelimiter(fullMatch, offset);

        if (escape || interpolate) {
            // We don't actually care about escaping for linting purposes.
            // We can assume that the escape function used by the library is
            // lint-free, or at least that users don't want to see lint errors
            // due to the library.
            // Also, we want to add eslint-disable-line semi to avoid errors in
            // that rule, since only expressions should be valid here anyway.
            lines.push({
                code: "print(" + matchedCode + "); // eslint-disable-line semi",
                originalLine: currentLine,
                originalColumn: currentColumn + fullMatch.indexOf(matchedCode)
            });
        } else if (evaluate) {
            lines.push({
                code: matchedCode,
                originalLine: currentLine,
                originalColumn: currentColumn + fullMatch.indexOf(matchedCode)
            });
        }

        // Update currentLine from this match.
        newLines = fullMatch.match(newlineMatcher) || [];
        currentLine += newLines.length;

        if (newLines.length) {
            currentColumn = fullMatch.length - newlineMatcher.lastIndex;
        } else {
            currentColumn += fullMatch.length;
        }

        // Return matched string to avoid exceptions from some user agents
        return fullMatch;
    });

    return lines;
};
