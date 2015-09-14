// This js library builds the markdown formatting bar in Chime
// It also implements a custom undo/redo behavior for the markdown textarea using undo.js
// This is required to capture textarea content changes triggered from the formatting bar 
// Below is a list of expected behaviors:

// INLINE PATTERN BEHAVIOR

// Single Empty line: insert pattern with filler text
// Single Non-empty line: insert pattern with filler text
// Single Line && Selection: replace selection with filler text

// Multiple Lines: Break up into single lines and do same as above for each line.


// BLOCK PATTERN BEHAVIOR

// Single Empty line: Create pattern with filler text selected, cursor at selection beginning
// Single Non-Empty line: Make entire line block pattern with cursor at end
// Single Line && Selection: Make entire line block pattern with cursor at end

// Multiple Empty Lines: Create pattern with filler text selected, cursor at selection beginning.
// Multiple Non-Empty Lines: Break up to individual lines and treat each as a single non-empty line
// Multiple Lines with Partial or Complete Selection: Break up into individual lines and treat as single non-empty lines

// TODO: For mixed multiline selections, keep empty lines as empty lines.
// TODO: Deal with swapping of block patterns (e.g, turning a list item into a header)
// TOOD: Format whitespace around block elements.
// TODO: Implement ideal cursor position behavior after pattern is added
//	 - this includes preselection of filler text so user can start typing immediately without having to move the cursor.
// TODO: Make this work with <=IE9?
// TODO: Make undo/redo keyboard shortcuts specific to platform. Current you can do both CNTL+Z or META+Z on any platform
//			where META is COMMAND or WINDOWS key.


function MarkdownBar(bar, textarea) {

	var self = this;
	var markdownBar = $(bar);
	var markdownTextarea = $(textarea);

	// Values to keep track of current state of the text editor (value and selection range).
	var initialValue, initialSelection;

	//Implement Undo Stack
	var undoStack = new Undo.Stack();
	var EditCommand = Undo.Command.extend({
		constructor: function(textarea, initialValue, finalValue, initialSelection, finalSelection) {
			this.textarea = textarea;
			this.initialValue = initialValue;
			this.finalValue = finalValue;
			this.initialSelection = initialSelection;
			this.finalSelection = finalSelection;
		},
		execute: function() {
			// trigger is required for live preview to update.
			this.textarea.trigger('change');
		},
		undo: function() {
			this.textarea.val(this.initialValue)
			initialValue = this.initialValue;
			initialSelection = this.initialSelection;
			console.log(this.initialSelection);
			self.setSelectionRange(this.textarea.get(0), this.initialSelection.start, this.initialSelection.end)
			this.textarea.trigger('change');
		},
		redo: function() {
			this.textarea.val(this.finalValue)
			initialValue = this.finalValue;
			console.log(this.finalSelection);
			initialSelection = this.finalSelection;
			self.setSelectionRange(this.textarea.get(0), this.finalSelection.start, this.finalSelection.end)
			this.textarea.trigger('change');
		}
	})

	//Define Markdown Patterns
	var PATTERNS = [
		{
			'name': 'Bold',
			'syntax': '**${content}**',
			'icon': '<span class="fa fa-bold"></span>',
			'filler': "This is bold text",
			'type': 'inline'
		},
		{
			'name': 'Italic',
			'syntax': '_${content}_',
			'icon': '<span class="fa fa-italic"></span>',
			'filler': 'This is italicized text',
			'type': 'inline'
		},
		{
			'name': 'Link',
			'syntax': '[${content}](http://www.example.com)',
			'icon': '<span class="fa fa-link"></span>',
			'filler': "This is a link",
			'type': 'inline'
		},
		{
			'name': 'Level 1 Heading',
			'syntax': '# ${content}',
			'icon': 'h1',
			'filler': 'This is a level 1 heading',
			'type': 'block'
		},
		{
			'name': 'Level 2 Heading',
			'syntax': '## ${content}',
			'icon': 'h2',
			'filler': 'This is a level 2 heading',
			'type': 'block'
		},
		{
			'name': 'Level 3 Heading',
			'syntax': '### ${content}',
			'icon': 'h3',
			'filler': 'This is a level 3 heading',
			'type': 'block'
		},
		{
			'name': 'Bulleted List',
			'syntax': '- ${content}',
			'icon': '<span class="fa fa-list-ul"></span>',
			'filler': "This is an bulleted list item",
			'type': 'block'
		},
		{
			'name': 'Numbered List',
			'syntax': '1. ${content}',
			'icon': '<span class="fa fa-list-ol"></span>',
			'filler': "This is an numbered list item",
			'type': 'block'
		},
		{
			'name': 'Blockquote',
			'syntax': '> ${content}',
			'icon': '<span class="fa fa-quote-right"></span>',
			'filler': "Lorem ipsum dolor sit amet, consectetur adipisicing elit. Id blanditiis voluptatem odit nesciunt. Fugit ipsam saepe, quisquam iste mollitia ducimus, recusandae, voluptatum libero eligendi nam sequi hic. Libero, tempore, suscipit!",
			'type': 'block'
		},

	];

	this.markdownify = function(event, syntax, filler, patternType) {
		event.preventDefault();

		initialValue = markdownTextarea.val();

		markdownTextarea.get(0).focus();

		// Compute initial and final selections
		var selection = self.getSelectionRange(markdownTextarea.get(0));
		var finalSelection = {};
		initialSelection.start = selection.start;
		initialSelection.end = selection.end;
		finalSelection.start = selection.start + syntax.indexOf('${content}');
		finalSelection.end = selection.end + syntax.indexOf('${content}');

		// change current selection to expand to entire line if using a block pattern
		if(patternType == "block") {
			while(markdownTextarea.val().charAt(selection.start-1) != '\n' && selection.start > 0) {
				selection.start--;
			}
			while(markdownTextarea.val().charAt(selection.end) != '\n' && selection.end < markdownTextarea.val().length) {
				selection.end++;
			}
		}

		// If multiple lines, iterate over each line.
		var newContent = "";
		var content = markdownTextarea.val().slice(selection.start, selection.end).split(/\n/);
		$(content).each(function(index, contentLine) {
			newContent = newContent + self.interpolate(syntax, {content: contentLine});
			if(index < content.length-1) {
				newContent = newContent + '\n';
			}
		});

		// Replace content in textarea
		var contentBefore = markdownTextarea.val().slice(0, selection.start);
		var contentAfter = markdownTextarea.val().slice(selection.end, markdownTextarea.val().length)
		var finalValue = (contentBefore + newContent + contentAfter);
		markdownTextarea.val(finalValue);

		//Add to undo stack and update initial value and selection
		undoStack.execute(new EditCommand(markdownTextarea, initialValue, finalValue, initialSelection, finalSelection));
		initialValue = finalValue;
		initialSelection = finalSelection;
		markdownTextarea.focus();
		self.setSelectionRange(markdownTextarea.get(0), finalSelection.start, finalSelection.end);
		
	}

	// String interpolation function
	this.interpolate = function(formatString, data) {
	    var i, len,
	        formatChar,
	        prevFormatChar,
	        prevPrevFormatChar;
	    var prop, startIndex = -1, endIndex = -1,
	        finalString = '';
	    for (i = 0, len = formatString.length; i<len; ++i) {
	        formatChar = formatString[i];
	        prevFormatChar = i===0 ? '\0' : formatString[i-1],
	        prevPrevFormatChar =  i<2 ? '\0' : formatString[i-2];

	        if (formatChar === '{' && prevFormatChar === '$' && prevPrevFormatChar !== '\\' ) {
	            startIndex = i;
	        } else if (formatChar === '}' && prevFormatChar !== '\\' && startIndex !== -1) {
	            endIndex = i;
	            finalString += data[formatString.substring(startIndex+1, endIndex)];
	            startIndex = -1;
	            endIndex = -1;
	        } else if (startIndex === -1 && startIndex === -1){
	            if ( (formatChar !== '\\' && formatChar !== '$') || ( (formatChar === '\\' || formatChar === '$') && prevFormatChar === '\\') ) {
	                finalString += formatChar;
	            }
	        }
	    }
	    return finalString;
	};

	// From: http://stackoverflow.com/questions/235411/is-there-an-internet-explorer-approved-substitute-for-selection.start-and-selecti
	// Cross-browser implementation of getting selection.
	this.getSelectionRange = function(el) {
	    var start = 0, end = 0, normalizedValue, range,
	        textInputRange, len, endRange;

	    if (typeof el.selectionStart == "number" && typeof el.selectionEnd == "number") {
	        start = el.selectionStart;
	        end = el.selectionEnd;
	    } 
	    else {
	        range = document.selection.createRange();

	        if (range && range.parentElement() == el) {
	            len = el.value.length;
	            normalizedValue = el.value.replace(/\r\n/g, "\n");

	            // Create a working TextRange that lives only in the input
	            textInputRange = el.createTextRange();
	            textInputRange.moveToBookmark(range.getBookmark());

	            // Check if the start and end of the selection are at the very end
	            // of the input, since moveStart/moveEnd doesn't return what we want
	            // in those cases
	            endRange = el.createTextRange();
	            endRange.collapse(false);

	            if (textInputRange.compareEndPoints("StartToEnd", endRange) > -1) {
	                start = end = len;
	            } else {
	                start = -textInputRange.moveStart("character", -len);
	                start += normalizedValue.slice(0, start).split("\n").length - 1;

	                if (textInputRange.compareEndPoints("EndToEnd", endRange) > -1) {
	                    end = len;
	                } else {
	                    end = -textInputRange.moveEnd("character", -len);
	                    end += normalizedValue.slice(0, end).split("\n").length - 1;
	                }
	            }
	        }
	    }

		return {
			start: start,
			end: end
		};
	}

	// From http://stackoverflow.com/questions/499126/jquery-set-cursor-position-in-text-area
	// Cross-browser implementation of setting selection.
	this.setSelectionRange = function(input, selectionStart, selectionEnd) {
		if (input.setSelectionRange) {
			input.focus();
			input.setSelectionRange(selectionStart, selectionEnd);
		}
		else if (input.createTextRange) {
			var range = input.createTextRange();
			range.collapse(true);
			range.moveEnd('character', selectionEnd);
			range.moveStart('character', selectionStart);
			range.select();
		}
	}

	
	this.init = function() {
		// initialize current state of the editor
		 initialValue = markdownTextarea.val();
		 initialSelection = self.getSelectionRange(markdownTextarea.get(0));

		// Bind Textarea to Undo Stack (reimplementing basic undo/redo functionality)
		var timer;
		markdownTextarea.bind('keyup', function(event) {
			// skip if keyup on 'Z' when undoing/redoing (metaKey or ctrlKey is held down)
			if (event.metaKey && event.which == 90 || event.ctrlKey && event.which == 90 ) {
				return false;
			}
			// skip if keyup on 'shift key' or 'command/window key'
			if(event.which == 16 || event.which == 91 || event.which == 93 || event.which == 224) {
				return false;
			}

			clearTimeout(timer);
			timer = setTimeout(function() {
				var finalValue = markdownTextarea.val();
				// Get final 
				var cursorDiff = finalValue.length - initialValue.length;
				var finalSelection = {};
				finalSelection.start = initialSelection.end + cursorDiff; //needs to subtract from cursor end for highlights
				finalSelection.end = initialSelection.end + cursorDiff;
				// ignore meta key presses
				if (finalValue != initialValue) {
					//add to undoStack and update initial value and selections
					console.log(initialSelection.start, finalSelection.start);
					undoStack.execute(new EditCommand(markdownTextarea, initialValue, finalValue, initialSelection, finalSelection));
					initialValue = finalValue;
					initialSelection = finalSelection;
				}
			}, 150);
		});

		// Update current selection range state on events that can change the selection range.
		$(markdownTextarea).on('keydown click focus mouseup', function(e) {
			currentSelection = self.getSelectionRange(markdownTextarea.get(0));
			var finalValue = markdownTextarea.val();
			if(finalValue == initialValue) {
				initialSelection = currentSelection;
				console.log(initialSelection);
			}
		})


		// Add buttons to markdown bar and bind events
		$(PATTERNS).each(function(index, pattern) {
			var patternButton = $('<button class="button toolbar__item markdown-bar__button">' + pattern['icon'] + '<span class="markdown-bar__tooltip">' + pattern['name'] + '</span></button>');
			patternButton.bind('click', function(event) {
				self.markdownify(event, pattern['syntax'], pattern['filler'], pattern['type']);
			});
			markdownBar.append(patternButton);
		});


		// Create Undo/Redo Keyboard Shortcuts
		$(document).keydown(function(event) {
			// Ignore if not keydown on Z, and ignore if there isn't either a metaKey or ctrlKey pressed while keydown on Z
			if (!(event.metaKey || event.ctrlKey) || event.which != 90) {
				return;
			}
			event.preventDefault();
			if (event.shiftKey) {
				undoStack.canRedo() && undoStack.redo()
			} else {
				undoStack.canUndo() && undoStack.undo();
			}
		});


		// Create Undo/redo buttons
		var undoButton = $('<button href="#" id="undo-button" class="toolbar__item button markdown-bar__button"><span class="fa fa-undo"></span><span class="markdown-bar__tooltip">Undo</span></button>'),
			redoButton = $('<button href="#" id="redo-button" class="toolbar__item button markdown-bar__button"><span class="fa fa-repeat"></span><span class="markdown-bar__tooltip">Redo</span></button>')

		function updateUndoStackUI() {
			undoButton.attr("disabled", !undoStack.canUndo());
			redoButton.attr("disabled", !undoStack.canRedo());
		}

		undoStack.changed = function() {
			updateUndoStackUI();
		};


		undoButton.click(function(e) {
			undoStack['undo']();
			return false;
		});

		redoButton.click(function(e) {
			undoStack['redo']();
			return false;
		});

		markdownBar.append('<div class="toolbar__item markdown-bar__divider"> </div>');
		markdownBar.append(undoButton);
		markdownBar.append(redoButton);
		updateUndoStackUI();
	}

	this.init();
}



$(document).ready(function() {
	var markdownBar = new MarkdownBar('.markdown-bar', '.markdown-textarea');
})