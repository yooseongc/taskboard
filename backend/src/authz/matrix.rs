use super::authn::{AuthnUser, GlobalRole};
use super::resource_ref::ResourceRef;

/// S-025: Actions that can be performed on resources.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Action {
    Create,
    Read,
    Update,
    Delete,
    ManageMembers,
}

/// S-025: Resource types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ResourceType {
    Board,
    Task,
    Template,
    Comment,
    DeptManagement,
}

/// S-025: Board-level roles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BoardRole {
    BoardAdmin,
    BoardMember,
    BoardViewer,
}

/// S-025: Authorization decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Decision {
    Deny = 0,
    Allow = 1,
}

// Index helpers
impl Action {
    fn idx(self) -> usize {
        match self {
            Self::Create => 0,
            Self::Read => 1,
            Self::Update => 2,
            Self::Delete => 3,
            Self::ManageMembers => 4,
        }
    }
}

impl ResourceType {
    fn idx(self) -> usize {
        match self {
            Self::Board => 0,
            Self::Task => 1,
            Self::Template => 2,
            Self::Comment => 3,
            Self::DeptManagement => 4,
        }
    }
}

impl GlobalRole {
    fn matrix_idx(self) -> usize {
        match self {
            Self::SystemAdmin => 0,
            Self::DepartmentAdmin => 1,
            Self::Member => 2,
            Self::Viewer => 3,
        }
    }
}

impl BoardRole {
    fn idx(self) -> usize {
        match self {
            Self::BoardAdmin => 0,
            Self::BoardMember => 1,
            Self::BoardViewer => 2,
        }
    }

    pub fn from_str_opt(s: &str) -> Option<Self> {
        match s {
            "BoardAdmin" => Some(Self::BoardAdmin),
            "BoardMember" => Some(Self::BoardMember),
            "BoardViewer" => Some(Self::BoardViewer),
            _ => None,
        }
    }
}

const A: Decision = Decision::Allow;
const D: Decision = Decision::Deny;

/// S-025: Global role matrix [4 roles][5 resources][5 actions].
/// Rows: SysAdmin, DeptAdmin, Member, Viewer
/// Cols per resource: Create, Read, Update, Delete, ManageMembers
static MATRIX: [[[Decision; 5]; 5]; 4] = [
    // SystemAdmin
    [[A, A, A, A, A], [A, A, A, A, A], [A, A, A, A, A], [A, A, A, A, A], [A, A, A, A, A]],
    // DepartmentAdmin
    [[A, A, A, A, A], [A, A, A, A, A], [A, A, A, A, D], [A, A, A, A, D], [A, A, A, A, A]],
    // Member
    [[D, A, D, D, D], [A, A, A, D, D], [A, A, A, D, D], [A, A, A, D, D], [D, A, D, D, D]],
    // Viewer
    [[D, A, D, D, D], [D, A, D, D, D], [D, A, D, D, D], [D, A, D, D, D], [D, A, D, D, D]],
];

/// S-025: Board-level role matrix [3 roles][5 resources][5 actions].
/// Rows: BoardAdmin, BoardMember, BoardViewer
static BOARD_MATRIX: [[[Decision; 5]; 5]; 3] = [
    // BoardAdmin
    [[D, A, A, A, A], [A, A, A, A, A], [D, A, D, D, D], [A, A, A, A, D], [D, D, D, D, D]],
    // BoardMember
    [[D, A, D, D, D], [A, A, A, D, D], [D, A, D, D, D], [A, A, A, D, D], [D, D, D, D, D]],
    // BoardViewer
    [[D, A, D, D, D], [D, A, D, D, D], [D, A, D, D, D], [D, A, D, D, D], [D, D, D, D, D]],
];

/// S-025: evaluate authorization decision.
///
/// # Arguments
/// * `user` - authenticated user
/// * `action` - requested action
/// * `resource` - resource reference (type + optional board context)
/// * `is_internal` - whether the user is internal to the owning departments
///   (direct membership OR ancestor-or-self relationship, computed by caller)
pub fn evaluate(
    user: &AuthnUser,
    action: Action,
    resource: &ResourceRef,
    is_internal: bool,
) -> Decision {
    // Step 1: SystemAdmin always Allow
    if user.global_roles.contains(&GlobalRole::SystemAdmin) {
        return Decision::Allow;
    }

    // Step 3: Global decision
    let global_decision = if is_internal {
        let highest = GlobalRole::highest(&user.global_roles);
        MATRIX[highest.matrix_idx()][resource.resource_type.idx()][action.idx()]
    } else {
        Decision::Deny
    };

    // Step 4: Board decision
    let board_decision = if let Some(board_role) = &resource.board_role {
        BOARD_MATRIX[board_role.idx()][resource.resource_type.idx()][action.idx()]
    } else {
        Decision::Deny
    };

    // Step 5: final = max(global, board)
    std::cmp::max(global_decision, board_decision)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::authz::authn::GlobalRole;
    use crate::authz::resource_ref::ResourceRef;

    fn make_user(roles: Vec<GlobalRole>) -> AuthnUser {
        AuthnUser {
            user_id: uuid::Uuid::nil(),
            external_id: "test".to_string(),
            name: "Test".to_string(),
            email: "test@example.com".to_string(),
            global_roles: roles,
            department_ids: vec![],
            active: true,
        }
    }

    // -----------------------------------------------------------------------
    // Regression guard: Finding #3 — ancestor-or-self reflected in evaluate
    //   evaluate() takes is_internal as a pre-computed bool. When true,
    //   DepartmentAdmin gets full global matrix access. When false (external),
    //   only board_local role applies. The ancestor-or-self check is done by
    //   the caller (is_user_internal in check.rs), so here we verify that
    //   evaluate() correctly uses the flag.
    // -----------------------------------------------------------------------

    #[test]
    fn q001_system_admin_always_allow() {
        // S-025: SystemAdmin bypasses all matrix checks.
        let user = make_user(vec![GlobalRole::SystemAdmin]);
        let resource = ResourceRef::new(ResourceType::Board);
        assert_eq!(evaluate(&user, Action::Delete, &resource, false), Decision::Allow);
        assert_eq!(evaluate(&user, Action::ManageMembers, &resource, false), Decision::Allow);

        // Even for DeptManagement
        let dept = ResourceRef::new(ResourceType::DeptManagement);
        assert_eq!(evaluate(&user, Action::Delete, &dept, false), Decision::Allow);
    }

    #[test]
    fn q001_dept_admin_internal_allow_board_crud() {
        // S-025: DepartmentAdmin (internal) can CRUD boards.
        let user = make_user(vec![GlobalRole::DepartmentAdmin]);
        let resource = ResourceRef::new(ResourceType::Board);

        assert_eq!(evaluate(&user, Action::Create, &resource, true), Decision::Allow);
        assert_eq!(evaluate(&user, Action::Read, &resource, true), Decision::Allow);
        assert_eq!(evaluate(&user, Action::Update, &resource, true), Decision::Allow);
        assert_eq!(evaluate(&user, Action::Delete, &resource, true), Decision::Allow);
        assert_eq!(evaluate(&user, Action::ManageMembers, &resource, true), Decision::Allow);
    }

    #[test]
    fn q001_dept_admin_external_deny_without_board_role() {
        // Finding #3 regression guard: DeptAdmin who is NOT internal
        // (no ancestor-or-self match) and has no board role -> Deny.
        let user = make_user(vec![GlobalRole::DepartmentAdmin]);
        let resource = ResourceRef::new(ResourceType::Board);

        assert_eq!(evaluate(&user, Action::Read, &resource, false), Decision::Deny);
        assert_eq!(evaluate(&user, Action::Create, &resource, false), Decision::Deny);
    }

    #[test]
    fn q001_max_global_board_role_composition() {
        // S-025: final = max(global, board_local).
        // DeptAdmin (internal) + BoardViewer => DeptAdmin wins.
        let user = make_user(vec![GlobalRole::DepartmentAdmin]);
        let resource = ResourceRef::new(ResourceType::Task)
            .with_board_role(BoardRole::BoardViewer);

        // DeptAdmin internal => Task Create = Allow
        // BoardViewer => Task Create = Deny
        // max(Allow, Deny) = Allow
        assert_eq!(evaluate(&user, Action::Create, &resource, true), Decision::Allow);
    }

    #[test]
    fn q001_viewer_comment_create_deny() {
        // S-025: Viewer cannot create comments.
        // MATRIX[Viewer][Comment][Create] = D
        let user = make_user(vec![GlobalRole::Viewer]);
        let resource = ResourceRef::new(ResourceType::Comment);

        assert_eq!(evaluate(&user, Action::Create, &resource, true), Decision::Deny);
    }

    #[test]
    fn q001_viewer_board_read_allow_when_internal() {
        // MATRIX[Viewer][Board][Read] = A
        let user = make_user(vec![GlobalRole::Viewer]);
        let resource = ResourceRef::new(ResourceType::Board);

        assert_eq!(evaluate(&user, Action::Read, &resource, true), Decision::Allow);
    }

    #[test]
    fn q001_member_cannot_delete_task() {
        // MATRIX[Member][Task][Delete] = D
        let user = make_user(vec![GlobalRole::Member]);
        let resource = ResourceRef::new(ResourceType::Task);

        assert_eq!(evaluate(&user, Action::Delete, &resource, true), Decision::Deny);
    }

    #[test]
    fn q001_board_admin_manage_members_allow() {
        // BOARD_MATRIX[BoardAdmin][Board][ManageMembers] = A
        let user = make_user(vec![GlobalRole::Viewer]);
        let resource = ResourceRef::new(ResourceType::Board)
            .with_board_role(BoardRole::BoardAdmin);

        // Viewer internal => Board ManageMembers = Deny
        // BoardAdmin => Board ManageMembers = Allow
        // max(D, A) = A
        assert_eq!(evaluate(&user, Action::ManageMembers, &resource, true), Decision::Allow);
    }

    #[test]
    fn q001_board_member_cannot_delete_task() {
        // BOARD_MATRIX[BoardMember][Task][Delete] = D
        // External user with BoardMember role
        let user = make_user(vec![GlobalRole::Viewer]);
        let resource = ResourceRef::new(ResourceType::Task)
            .with_board_role(BoardRole::BoardMember);

        assert_eq!(evaluate(&user, Action::Delete, &resource, false), Decision::Deny);
    }

    #[test]
    fn q001_board_member_can_create_task() {
        // BOARD_MATRIX[BoardMember][Task][Create] = A
        let user = make_user(vec![GlobalRole::Viewer]);
        let resource = ResourceRef::new(ResourceType::Task)
            .with_board_role(BoardRole::BoardMember);

        assert_eq!(evaluate(&user, Action::Create, &resource, false), Decision::Allow);
    }

    #[test]
    fn q001_empty_roles_defaults_to_viewer() {
        // GlobalRole::highest on empty list defaults to Viewer
        let user = make_user(vec![]);
        let resource = ResourceRef::new(ResourceType::Board);

        // Viewer + internal => Board Read = Allow, Board Create = Deny
        assert_eq!(evaluate(&user, Action::Read, &resource, true), Decision::Allow);
        assert_eq!(evaluate(&user, Action::Create, &resource, true), Decision::Deny);
    }

    #[test]
    fn q001_dept_management_member_deny() {
        // MATRIX[Member][DeptManagement][*] => [D, A, D, D, D]
        let user = make_user(vec![GlobalRole::Member]);
        let resource = ResourceRef::new(ResourceType::DeptManagement);

        assert_eq!(evaluate(&user, Action::Create, &resource, true), Decision::Deny);
        assert_eq!(evaluate(&user, Action::Read, &resource, true), Decision::Allow);
        assert_eq!(evaluate(&user, Action::Update, &resource, true), Decision::Deny);
        assert_eq!(evaluate(&user, Action::Delete, &resource, true), Decision::Deny);
    }
}
