
// 'use server';
// This function has been disabled to allow for static hosting.
export async function testJiraConnection(params: any) {
    console.log("Jira synchronization is disabled for static hosting.");
    return { success: false, message: 'Jira integration is disabled for static hosting.' };
}
