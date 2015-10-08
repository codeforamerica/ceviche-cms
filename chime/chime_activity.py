# -- coding: utf-8 --
from __future__ import absolute_import

import re
import json
from os.path import join
from collections import Counter
from datetime import datetime
from . import constants, repo_functions

class BaseActivity(object):
    ''' A base activity object for ChimeActivity and ChimePublishedActivity
    '''
    def __init__(self, repo, branch_name, default_branch_name):
        ''' Create a new activity.
        '''
        self.repo = repo
        self.safe_branch = branch_name
        self.default_branch_name = default_branch_name

        # paths to various relevant routes
        self.overview_path = u'/tree/{}/'.format(self.safe_branch)
        self.edit_path = u'/tree/{}/edit/'.format(self.safe_branch)
        self.view_path = u'/tree/{}/view/'.format(self.safe_branch)
        self.review_path = u'/tree/{}/review/'.format(self.safe_branch)
        self.rename_path = u'/tree/{}/rename/'.format(self.safe_branch)
        # paths for form actions
        self.comment_action = u'/tree/{}/comment/'.format(self.safe_branch)
        self.rename_action = u'/tree/{}/rename/'.format(self.safe_branch)

        # activity profile
        self.author_email = None
        self.task_description = None

        # the email of the last person who edited the activity
        self.last_edited_email = None

        # review status
        self.review_state = None
        self.review_authorized = None

        # relative dates
        self.date_created = None
        self.date_updated = None
        # datetime object
        self.datetime_updated = None

        # only build history and working state if requested
        self._history = None
        self._history_summary = None
        self._working_state = None

    @property
    def history(self):
        ''' Get the activity history.
        '''
        if not self._history:
            self._history = self._make_history()

        return self._history

    @property
    def history_summary(self):
        ''' Get the activity history summary.
        '''
        if not self._history_summary:
            self._history_summary = self._make_history_summary()

        return self._history_summary

    @property
    def working_state(self):
        ''' Get the activity working state.
        '''
        if not self._working_state:
            self._working_state = repo_functions.get_activity_working_state(self.repo, self.default_branch_name, self.safe_branch)

        return self._working_state

    def _get_history_log(self, log_format):
        ''' Get a git log from which to create the activity's history.
        '''
        # implemented by sub-classes
        pass

    def _make_history(self):
        ''' Make an easily-parsable history of the activity since it was created.
        '''
        # implemented by sub-classes
        pass

    def _construct_history(self):
        ''' Create a list of log items from the raw history log
        '''
        # see <http://git-scm.com/docs/git-log> for placeholders
        log = self._get_history_log(log_format='%x00Name: %an\tEmail: %ae\tDate: %ar\tSubject: %s\tBody: %b%x00')

        history = []
        pattern = re.compile(r'\x00Name: (.*?)\tEmail: (.*?)\tDate: (.*?)\tSubject: (.*?)\tBody: (.*?)\x00', re.DOTALL)
        for log_details in pattern.findall(log):
            name, email, date, subject, body = tuple([item for item in log_details])
            # convert the body to a json object and use it as the basis for the log item
            try:
                log_item = json.loads(body)
                # NOTE: old-style commit messages may've had a list of actions as the body
                if type(log_item) is list:
                    log_item = dict(actions=log_item)
                if 'message' not in log_item:
                    log_item['message'] = u''
            except ValueError:
                # NOTE: don't break if this is an old-style commit message
                log_item = dict(message=body)

            commit_category, commit_type, commit_action = repo_functions.get_commit_classification(subject, body)
            log_item.update(dict(author_name=name, author_email=email, commit_date=date, commit_subject=subject, commit_category=commit_category, commit_type=commit_type, commit_action=commit_action))
            history.append(log_item)

        return history

    def _make_history_summary(self):
        ''' Make an object that summarizes the activity's history.

            The object looks like this:
            {
                'description':
                    {
                        'long': u'3 articles and 1 topic have been changed',
                        'short': u'4 changes'
                    },
                'changes': [
                    {'edit_path': u'', 'display_type': u'Article', 'actions': u'Created, Edited, Deleted', 'title': u'How to Find Us'},
                    {'edit_path': u'/tree/34246e3/edit/contact/hours-of-operation/', 'display_type': u'Article', 'actions': u'Created, Edited', 'title': u'Hours of Operation'},
                    {'edit_path': u'/tree/34246e3/edit/contact/driving-directions/', 'display_type': u'Article', 'actions': u'Created, Edited', 'title': u'Driving Directions'},
                    {'edit_path': u'/tree/34246e3/edit/contact/', 'display_type': u'Topic', 'actions': u'Created', 'title': u'Contact'}
                ]
            }
        '''
        # an empty summary object
        history_summary = dict(description=dict(long=u'', short=u''), changes=[])

        ed_lookup = {'create': u'created', 'edit': u'edited', 'delete': u'deleted'}
        change_lookup = {}
        display_types_encountered = []
        # we only care about edits
        edit_history = [log_item for log_item in reversed(self.history) if log_item['commit_category'] == constants.COMMIT_CATEGORY_EDIT]
        for log_item in edit_history:
            # don't continue if there's not a list of actions
            if 'actions' not in log_item or type(log_item['actions']) is not list:
                continue

            # step through the changed files
            # NOTE: don't break if this is an old-style commit message
            actions = log_item['actions']
            for file_change in actions:
                # the passed title or the filename if no title is there
                title = file_change['title'] or file_change['file_path'].split('/')[-1]
                # the passed display type or Unknown if no type is there
                display_type = file_change['display_type'] or u'unknown'
                # how to represent the display type in the interface (i.e. Category -> Topic)
                show_type = constants.LAYOUT_DISPLAY_LOOKUP[display_type] if display_type in constants.LAYOUT_DISPLAY_LOOKUP else display_type
                display_type = display_type.title()
                show_type = show_type.title()
                try:
                    action = ed_lookup[file_change['action']].title()
                except:
                    action = file_change['action'].title()
                file_path = file_change['file_path']

                # if the last action is delete, we don't want an edit_path to a file that no longer exists
                edit_path = join(u'/tree/{}/edit/'.format(self.safe_branch), repo_functions.strip_index_file(file_path)) if action != u'Deleted' else u''
                sort_time = datetime.now()
                if file_path in change_lookup:
                    change_lookup[file_path]['sort_time'] = sort_time
                    # add the action to the end of the list if it's different from the last action added
                    if not re.search(r'{}$'.format(action), change_lookup[file_path]['actions']):
                        change_lookup[file_path]['actions'] = change_lookup[file_path]['actions'] + u', {}'.format(action)
                    # add the other variables, which may've changed
                    change_lookup[file_path]['edit_path'] = edit_path
                    change_lookup[file_path]['title'] = title
                    change_lookup[file_path]['display_type'] = show_type
                else:
                    change_lookup[file_path] = dict(title=title, display_type=show_type, actions=action, edit_path=edit_path, sort_time=sort_time)
                    display_types_encountered.append(display_type)

        # flatten and sort the changes
        changes = [change_lookup[item] for item in change_lookup]
        len_changes = len(changes)
        if len_changes:
            changes.sort(key=lambda k: k['sort_time'], reverse=True)
            history_summary['changes'] = changes

            # now construct the summary sentences
            long_description_parts = []
            display_type_tally = Counter(display_types_encountered)
            display_lookup = (
                (display_type_tally[constants.ARTICLE_LAYOUT.title()], unicode(constants.LAYOUT_DISPLAY_LOOKUP[constants.ARTICLE_LAYOUT]), unicode(constants.LAYOUT_PLURAL_LOOKUP[constants.ARTICLE_LAYOUT])),
                (display_type_tally[constants.CATEGORY_LAYOUT.title()], unicode(constants.LAYOUT_DISPLAY_LOOKUP[constants.CATEGORY_LAYOUT]), unicode(constants.LAYOUT_PLURAL_LOOKUP[constants.CATEGORY_LAYOUT]))
            )
            for tally, singular, plural in display_lookup:
                if tally:
                    long_description_parts.append("{} {}".format(tally, singular if tally == 1 else plural))
            has_have = u'have' if len_changes > 1 else u'has'
            long_description = u'{} {} been changed'.format(u', '.join(long_description_parts[:-2] + [u' and '.join(long_description_parts[-2:])]), has_have)
            history_summary['description']['long'] = long_description
        else:
            history_summary['description']['long'] = u'No changes in this activity yet'

        history_summary['description']['short'] = u'{} {}'.format(len_changes, u'change' if len_changes == 1 else u'changes')

        return history_summary

    def _process_task_metadata(self, task_metadata):
        ''' Extract and return values from the task metadata.
        '''
        author_email = task_metadata['author_email'] if 'author_email' in task_metadata else u''
        task_description = task_metadata['task_description'] if 'task_description' in task_metadata else self.safe_branch
        return author_email, task_description


class ChimeActivity(BaseActivity):
    ''' A representation of an activity in Chime
    '''
    def __init__(self, repo, branch_name, default_branch_name, actor_email):
        ''' Create a new activity.
        '''
        super(ChimeActivity, self).__init__(repo, branch_name, default_branch_name)

        task_metadata = repo_functions.get_task_metadata_for_branch(self.repo, self.safe_branch)
        self.author_email, self.task_description = self._process_task_metadata(task_metadata)

        # the email of the last person who edited the activity
        self.last_edited_email = repo_functions.get_last_edited_email(
            repo=self.repo, default_branch_name=self.default_branch_name,
            working_branch_name=self.safe_branch
        )

        self.review_state, self.review_authorized = repo_functions.get_review_state_and_authorized(
            repo=self.repo, default_branch_name=self.default_branch_name,
            working_branch_name=self.safe_branch, actor_email=actor_email
        )

        self.date_created = self.repo.git.log(self.safe_branch, '--format=%ar', '--', repo_functions.TASK_METADATA_FILENAME).split('\n')[-1]
        self.date_updated = self.repo.git.log(self.safe_branch, '-1', '--format=%ar')
        self.datetime_updated = datetime.fromtimestamp(float(self.repo.git.log(self.safe_branch, '-1', '--format=%at')))

    def _get_history_log(self, log_format):
        ''' Get a git log from which to create the activity's history
        '''
        hexsha = self.repo.branches[self.safe_branch].commit.hexsha
        return self.repo.git.log('--format={}'.format(log_format), 'master..{}'.format(hexsha))

    def _make_history(self):
        ''' Make an easily-parsable history of the activity since it was created.
        '''
        return self._construct_history()


class ChimePublishedActivity(BaseActivity):
    ''' A representation of a published activity in Chime
    '''
    def __init__(self, repo, branch_name, default_branch_name):
        ''' Create a new activity
        '''
        super(ChimePublishedActivity, self).__init__(repo, branch_name, default_branch_name)

        # you can't edit, view, review, rename, or comment in a published activity
        self.edit_path = None
        self.view_path = None
        self.review_path = None
        self.rename_path = None
        self.comment_action = None
        self.rename_action = None

        task_metadata = repo_functions.get_task_metadata_from_tag(clone=self.repo, working_branch_name=self.safe_branch) # *
        self.author_email, self.task_description = self._process_task_metadata(task_metadata)

        # get date updated and last edited email from the tag's git log
        hexsha = repo.tags[self.safe_branch].tag.hexsha
        date_updated, last_edited_email = repo.git.log('--format=%ar\t%ae', '{}^!'.format(hexsha)).split('\t')

        # the email of the last person who edited the activity (stripping angle brackets if they're there)
        self.last_edited_email = last_edited_email.lstrip(u'<').rstrip(u'>')

        # we know the current review state and authorized status
        self.review_state = constants.REVIEW_STATE_PUBLISHED
        self.review_authorized = False

        # set date created and updated the same for now
        self.date_created = date_updated
        self.date_updated = date_updated
        self.datetime_updated = datetime.fromtimestamp(float(self.repo.git.log('--format=%at', '{}^!'.format(hexsha))))

    def _get_history_log(self, log_format):
        ''' Get a git log from which to create the activity's history
        '''
        hexsha = self.repo.tags[self.safe_branch].commit.hexsha
        return self.repo.git.log('--format={}'.format(log_format), hexsha)

    def _make_history(self):
        ''' Make an easily-parsable history of the activity since it was created.
        '''
        full_history = self._construct_history()
        edited_history = []
        # crop the history to the beginning of this published activity
        for log_item in full_history:
            # filter by branch name, if it's there
            has_branch_name = 'branch_name' in log_item and log_item['branch_name']
            is_eligible = has_branch_name and log_item['branch_name'] == self.safe_branch
            # NOTE: include it if it doesn't have a branch name, for backwards-compatibility
            if is_eligible or not has_branch_name:
                edited_history.append(log_item)
                if log_item['commit_type'] == constants.COMMIT_TYPE_ACTIVITY_UPDATE and log_item['commit_subject'] == u'The "{}" {}'.format(self.task_description, repo_functions.ACTIVITY_CREATED_MESSAGE):
                    break

        return edited_history
