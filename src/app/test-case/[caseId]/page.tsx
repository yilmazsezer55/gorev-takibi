
import TestCasePage from './TestCasePage';

export function generateStaticParams() {
    return [{ caseId: 'placeholder' }];
}

export default function Page() {
    return <TestCasePage />;
}
