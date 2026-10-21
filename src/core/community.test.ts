import { addCommunityComment, addCommunityFeedback, issueCategory, issueStatus,
  loadCommunityComments, loadCommunityIssues, toggleCommunityVote } from './community';

test('all community tabs have local fixtures without network requests', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch');
  try {
    const issues = await loadCommunityIssues();
    expect(issues.length).toBeGreaterThan(4);
    expect(issues.some((issue) => issueStatus(issue) === 'planned')).toBe(true);
    expect(issues.some((issue) => issueStatus(issue) === 'progress')).toBe(true);
    expect(issues.some((issue) => issueCategory(issue) === 'bug')).toBe(true);
    expect(await loadCommunityComments(1)).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally { fetchSpy.mockRestore(); }
});
test('demo voting toggles without inflating support on repeated taps', async () => {
  const before = (await loadCommunityIssues())[0];
  expect(toggleCommunityVote(before.number)).toMatchObject({ voted: true, votes: before.votes + 1 });
  expect(toggleCommunityVote(before.number)).toMatchObject({ voted: false, votes: before.votes });
});
test('feedback and comments appear in the local demo, copies cannot mutate the fixtures', async () => {
  const issue = addCommunityFeedback('  Teste  ', ' Detalhes ', 'bug');
  expect(issue).toMatchObject({ title: 'Teste', body: 'Detalhes', status: 'pending', votes: 1, category: 'bug' });
  addCommunityComment(issue.number, ' Comentário ');
  expect(await loadCommunityComments(issue.number)).toEqual([expect.objectContaining({ body: 'Comentário' })]);
  const list = await loadCommunityIssues();
  expect(list[0].comments).toBe(1);
  list[0].title = 'mutation';
  expect((await loadCommunityIssues())[0].title).toBe('Teste');
  expect(() => addCommunityFeedback(' ', ' ', 'bug')).toThrow();
});
