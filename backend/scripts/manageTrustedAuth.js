#!/usr/bin/env node

const readline = require('node:readline/promises');
const { stdin: input, stdout: output } = require('node:process');
const { createClient } = require('@supabase/supabase-js');

const [action, userId, factorId] = process.argv.slice(2);
const confirmation = 'I VERIFIED IDENTITY OUTSIDE EMAIL';

function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

async function confirmIdentity(user, factor) {
    const rl = readline.createInterface({ input, output });
    try {
        console.log(`Target account: ${user.email || '(no email)'} (${user.id})`);
        if (factor) console.log(`Verified authenticator to approve or remove: ${factor.friendly_name || 'Authenticator'} (${factor.id})`);
        console.log('Verify the person through a separate, previously known channel. Email access alone is not sufficient.');
        const answer = await rl.question(`Type "${confirmation}" to continue: `);
        if (answer !== confirmation) throw new Error('Identity verification was not confirmed; no changes were made.');
    } finally {
        rl.close();
    }
}

async function main() {
    if (!['setup', 'approve', 'recover', 'factors'].includes(action) || !userId ||
        (action === 'approve' && !factorId) || (action === 'recover' && factorId)) {
        throw new Error('Usage: node backend/scripts/manageTrustedAuth.js setup <user-id> | factors <user-id> | approve <user-id> <verified-totp-factor-id> | recover <user-id>');
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
        throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in your local environment.');
    }

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    });
    const { data: result, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw error;
    const user = result?.user;
    if (!user) throw new Error('Supabase user not found.');

    const { data: factorData, error: factorError } = await supabase.auth.admin.mfa.listFactors({ userId });
    if (factorError) throw factorError;
    const factors = factorData?.factors || [];

    if (action === 'factors') {
        const verifiedTotp = factors.filter(item => item.factor_type === 'totp' && item.status === 'verified');
        if (!verifiedTotp.length) {
            console.log('No verified TOTP factors found.');
        } else {
            for (const factor of verifiedTotp) console.log(`${factor.id}  ${factor.friendly_name || 'Authenticator'}  ${factor.status}`);
        }
        return;
    }

    const appMetadata = { ...(user.app_metadata || {}) };
    if (action === 'approve' && appMetadata.confqual_access_approved === true) {
        console.log('Account is already approved; no changes made.');
        return;
    }

    if (action === 'setup' && (
        appMetadata.confqual_access_approved === true ||
        appMetadata.confqual_mfa_setup_authorized === true
    )) {
        throw new Error('Account is already approved or setup is already authorized. Use recover only for a verified lost-factor recovery.');
    }
    if (action === 'approve' && appMetadata.confqual_mfa_setup_authorized !== true) {
        throw new Error('Authenticator setup has not been authorized for this account.');
    }

    const factor = action === 'setup' || action === 'recover'
        ? null
        : factors.find(item => item.id === factorId);
    if (action === 'approve' && (!factor || factor.factor_type !== 'totp' || factor.status !== 'verified')) {
        throw new Error('The specified factor is not a verified TOTP factor for this user; no changes were made.');
    }

    await confirmIdentity(user, factor);

    if (action === 'setup') {
        appMetadata.confqual_access_approved = false;
        appMetadata.confqual_mfa_setup_authorized = true;
        appMetadata.confqual_approved_totp_factor_id = null;
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
        if (updateError) throw updateError;
        for (const existingFactor of factors) {
            const { error: deleteError } = await supabase.auth.admin.mfa.deleteFactor({ userId, id: existingFactor.id });
            if (deleteError) throw deleteError;
        }
        console.log('Setup authorized and existing factors cleared. Supervise the user enrolling and verifying a fresh authenticator, then approve its verified factor.');
        return;
    }

    if (action === 'recover') {
        appMetadata.confqual_access_approved = false;
        appMetadata.confqual_mfa_setup_authorized = false;
        appMetadata.confqual_approved_totp_factor_id = null;
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
        if (updateError) throw updateError;
        for (const existingFactor of factors) {
            const { error: deleteError } = await supabase.auth.admin.mfa.deleteFactor({ userId, id: existingFactor.id });
            if (deleteError) throw deleteError;
        }
        console.log('Approval and setup authorization cleared; all remaining authenticator factors were removed. Verify the user again before authorizing replacement setup.');
        return;
    }

    appMetadata.confqual_access_approved = action === 'approve';
    appMetadata.confqual_mfa_setup_authorized = false;
    appMetadata.confqual_approved_totp_factor_id = factor.id;
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { app_metadata: appMetadata });
    if (updateError) throw updateError;

    if (action === 'approve') {
        console.log('Access approved. The user should sign in again before opening the workspace.');
        return;
    }

}

main().catch(error => fail(error.message || 'Trusted auth operation failed.'));
