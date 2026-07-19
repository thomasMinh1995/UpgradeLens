import equal from 'fast-deep-equal';

const expected = { status: 'review-required', actions: 0 };
const observed = { status: 'review-required', actions: 0 };

console.log(`Sample facts match: ${equal(expected, observed)}`);
