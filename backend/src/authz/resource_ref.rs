use super::matrix::{BoardRole, ResourceType};

/// D-034: ResourceRef — identifies what resource and optional board context
/// for authorization evaluation.
#[derive(Debug, Clone)]
pub struct ResourceRef {
    pub resource_type: ResourceType,
    /// If the resource is board-scoped, the user's role in that board.
    pub board_role: Option<BoardRole>,
}

impl ResourceRef {
    pub fn new(resource_type: ResourceType) -> Self {
        Self {
            resource_type,
            board_role: None,
        }
    }

    pub fn with_board_role(mut self, role: BoardRole) -> Self {
        self.board_role = Some(role);
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_ref_new_no_board_role() {
        let r = ResourceRef::new(ResourceType::Task);
        assert!(r.board_role.is_none());
        assert!(matches!(r.resource_type, ResourceType::Task));
    }

    #[test]
    fn resource_ref_with_board_role() {
        let r = ResourceRef::new(ResourceType::Board).with_board_role(BoardRole::Admin);
        assert_eq!(r.board_role, Some(BoardRole::Admin));
    }
}
